import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { isWav } from "../domain/voice.rules";
import { type Voice, VoiceSchema } from "../domain/voice.schema";
import type { VoicePort } from "../usecase/fox.usecase";
import { getJsonFile } from "./json-file.gateway";

// Lance un script PowerShell fixe ; les chemins des fichiers passent par des variables d'environnement. Il peut lever.
export const REQUEST_VARIABLE = "FOX_REQUEST";
export const OUTPUT_VARIABLE = "FOX_OUT";
export type ScriptRunner = (script: string, env: Record<string, string>) => Promise<void>;

// Les scripts ne contiennent jamais le texte : il est dans un JSON UTF-8 que le script lit (JOURNAL 2026-10-13). Ni
// guillemet inversé ni « ${ » ici : ce sont des gabarits JavaScript.
// `AsTask` : le pont WinRT vers .NET ; le nom du type est « IAsyncOperation`1 », le point de l'expression le remplace.
const AWAIT_FUNCTION = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -match '^IAsyncOperation.1$' })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
$utf8 = New-Object System.Text.UTF8Encoding($false)
`;

const FAILURE = `
catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
`;

const LIST_SCRIPT = `
$ErrorActionPreference = 'Stop'
try {
${AWAIT_FUNCTION}
$voices = @([Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | ForEach-Object { [pscustomobject]@{ name = $_.DisplayName; language = $_.Language } })
[IO.File]::WriteAllText($env:FOX_OUT, (ConvertTo-Json -InputObject $voices -Compress), $utf8)
}
${FAILURE}
`;

const SYNTHESIS_SCRIPT = `
$ErrorActionPreference = 'Stop'
try {
${AWAIT_FUNCTION}
$request = ConvertFrom-Json ([IO.File]::ReadAllText($env:FOX_REQUEST, $utf8))
$voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.DisplayName -eq $request.voice } | Select-Object -First 1
if (-not $voice) { throw "voix introuvable : $($request.voice)" }
$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$synth.Voice = $voice
$stream = Await ($synth.SynthesizeTextToStreamAsync($request.text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
$reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
$n = Await ($reader.LoadAsync([uint32]$stream.Size)) ([uint32])
$bytes = New-Object byte[] $n
$reader.ReadBytes($bytes)
[IO.File]::WriteAllBytes($env:FOX_OUT, $bytes)
}
${FAILURE}
`;

const POWERSHELL_LIMIT_MS = 20_000;

// PowerShell 5.1 (`powershell.exe`) : c'est lui qui connaît les voix « OneCore » par WinRT. Le script voyage encodé
// (-EncodedCommand : UTF-16 en base64), sans fichier ni stdin.
export function createPowerShellRunner(): ScriptRunner {
  return (script, env) =>
    new Promise((resolve, reject) => {
      const child = spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-EncodedCommand",
          Buffer.from(script, "utf16le").toString("base64"),
        ],
        { env: { ...process.env, ...env }, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
      );
      let errors = "";
      child.stderr.on("data", (chunk: Buffer) => {
        errors += chunk.toString("utf8");
      });
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`PowerShell n'a pas fini en ${POWERSHELL_LIMIT_MS / 1000} s`));
      }, POWERSHELL_LIMIT_MS);
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`PowerShell a échoué (code ${code}) : ${errors.trim().slice(0, 300)}`));
      });
    });
}

export type VoiceClientDeps = {
  // Le dossier des fichiers de travail (hors de git) : requête et WAV d'une synthèse, supprimés dès qu'elle finit.
  directory: string;
  run: ScriptRunner;
  createId: () => string;
};

// Les fichiers de travail : une requête JSON (le texte et la voix) et le WAV qui en sort.
const WORK_FILE = /\.(json|wav)$/;

// Au démarrage : ce qu'une synthèse interrompue (serveur tué en route) a laissé. Rend le nombre de fichiers supprimés.
export function sweepVoiceFiles(directory: string): number {
  if (!existsSync(directory)) return 0;
  const leftovers = readdirSync(directory).filter((name) => WORK_FILE.test(name));
  for (const name of leftovers) rmSync(join(directory, name), { force: true });
  return leftovers.length;
}

export function createVoiceClient({ directory, run, createId }: VoiceClientDeps): VoicePort {
  return {
    async list(): Promise<Voice[]> {
      mkdirSync(directory, { recursive: true });
      const output = join(directory, `${createId()}.json`);
      try {
        await run(LIST_SCRIPT, { [OUTPUT_VARIABLE]: output });
        return z.array(VoiceSchema).parse(getJsonFile(output));
      } finally {
        rmSync(output, { force: true });
      }
    },
    async synthesize({ text, voice }) {
      mkdirSync(directory, { recursive: true });
      const id = createId();
      const request = join(directory, `${id}.json`);
      const output = join(directory, `${id}.wav`);
      try {
        writeFileSync(request, JSON.stringify({ text, voice }), "utf8");
        await run(SYNTHESIS_SCRIPT, { [REQUEST_VARIABLE]: request, [OUTPUT_VARIABLE]: output });
        const bytes = readFileSync(output);
        if (!isWav(bytes)) throw new Error("PowerShell n'a pas produit de WAV valide");
        return bytes;
      } finally {
        rmSync(request, { force: true });
        rmSync(output, { force: true });
      }
    },
  };
}
