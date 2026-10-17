import { type ChildProcess, spawn } from "node:child_process";
import { LEVEL_STEP_MS } from "../domain/startle.rules";
import type { ClipEncoder, ClipLevels, ClipProbe, TrimRequest } from "../usecase/clip.usecase";

export type ProcessResult = { code: number | null; stdout: string; stderr: string };

// Lance un programme avec un tableau d'arguments (jamais un shell : les chemins ont des espaces). Il peut lever (programme
// introuvable, temps dépassé).
export type ProcessRunner = (
  command: string,
  args: string[],
  limitMs: number,
  // Combien de caractères de la fin de chaque sortie on garde (4000 par défaut : de quoi lire une erreur).
  keepChars?: number,
) => Promise<ProcessResult>;

const PROBE_LIMIT_MS = 15_000;
// Un programme bavard (ffmpeg) ne garde que la fin de sa sortie d'erreur : c'est là que se lit la cause.
const OUTPUT_KEPT = 4000;

const toTail = (text: string, keep: number): string => (text.length > keep ? text.slice(-keep) : text);

// Le lanceur de processus réel. `stop` tue ceux qui tournent encore (le serveur s'arrête en plein encodage).
export function createProcessRunner(): { run: ProcessRunner; stop(): void } {
  const running = new Set<ChildProcess>();
  return {
    run: (command, args, limitMs, keepChars = OUTPUT_KEPT) =>
      new Promise((resolve, reject) => {
        const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
        running.add(child);
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk: Buffer) => {
          stdout = toTail(stdout + chunk.toString("utf8"), keepChars);
        });
        child.stderr.on("data", (chunk: Buffer) => {
          stderr = toTail(stderr + chunk.toString("utf8"), keepChars);
        });
        const timer = setTimeout(() => {
          child.kill();
          reject(new Error(`${command} n'a pas fini en ${Math.round(limitMs / 1000)} s`));
        }, limitMs);
        child.once("error", (error: NodeJS.ErrnoException) => {
          clearTimeout(timer);
          running.delete(child);
          reject(error.code === "ENOENT" ? new Error(`${command} est introuvable (absent du PATH)`) : error);
        });
        child.once("close", (code) => {
          clearTimeout(timer);
          running.delete(child);
          resolve({ code, stdout, stderr });
        });
      }),
    stop() {
      for (const child of running) child.kill();
      running.clear();
    },
  };
}

export type FfmpegClient = ClipProbe & ClipEncoder & ClipLevels;

export type VideoEncoder = "h264_nvenc" | "libx264";

const toMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const toSecondsArgument = (seconds: number): string => seconds.toFixed(6);

// Le son est égalisé à -16 LUFS (cible EBU R128 des vidéos web), le pic reste sous -1,5 dBTP.
const AUDIO_FILTER = "loudnorm=I=-16:TP=-1.5:LRA=11";

// Le GPU (RTX 3070) en premier : ~100 images/s pendant un live, soit ~0,6 s par seconde de clip. cq 26 donne ~16 Mb/s (la source d'OBS : 19).
// libx264 ne sert que de repli.
const toVideoArgs = (encoder: VideoEncoder): string[] =>
  encoder === "h264_nvenc"
    ? ["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", "26", "-b:v", "0"]
    : ["-c:v", "libx264", "-preset", "veryfast", "-crf", "21"];

// Les arguments de ffmpeg : le début se place avant l'entrée et la durée gardée suit (coupe exacte à l'image, puisque la
// vidéo est recodée), une seule vidéo et le premier son s'il existe. Le fichier de sortie est un `.partial` : `-f mp4` dit le format.
export const toTrimArgs = (
  { inputPath, outputPath, start, end }: TrimRequest,
  encoder: VideoEncoder,
): string[] => [
  "-hide_banner",
  "-nostdin",
  "-y",
  "-loglevel",
  "error",
  "-ss",
  toSecondsArgument(start),
  "-i",
  inputPath,
  "-t",
  toSecondsArgument(end - start),
  "-map",
  "0:v:0",
  "-map",
  "0:a:0?",
  "-af",
  AUDIO_FILTER,
  ...toVideoArgs(encoder),
  "-profile:v",
  "high",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
  "-ar",
  "48000",
  "-movflags",
  "+faststart",
  "-f",
  "mp4",
  outputPath,
];

// Le pic de chaque fenêtre de 50 ms du premier son (rééchantillonné à 48 kHz : 2400 échantillons par fenêtre), que ffmpeg écrit sur sa
// sortie standard (`lavfi.astats.Overall.Peak_level=-12.3`, une ligne par fenêtre) : la même mesure que les levels d'OBS (le pic).
export const toLevelsArgs = (path: string): string[] => [
  "-hide_banner",
  "-nostdin",
  "-v",
  "error",
  "-i",
  path,
  "-vn",
  "-af",
  `aresample=48000,asetnsamples=n=${LEVEL_STEP_MS * 48}:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.Peak_level:file=-`,
  "-f",
  "null",
  "-",
];

// Le silence numérique s'écrit « -inf » : il vaut le plancher des levels d'OBS, -100 dB.
const LEVEL_FLOOR = -100;

// Les levels (dB) que ffmpeg a écrits, dans l'ordre ; rien de lisible : une liste vide.
export const toLevels = (stdout: string): number[] =>
  Array.from(stdout.matchAll(/Peak_level=(-?[0-9.]+|-?inf)/g), ([, text]) => {
    const level = Number.parseFloat(text ?? "");
    return Number.isFinite(level) ? Math.max(LEVEL_FLOOR, level) : LEVEL_FLOOR;
  });

// ffmpeg ne dit que la fin de sa sortie d'erreur : les dernières lignes, sur une ligne.
const toFailure = (result: ProcessResult): string =>
  `ffmpeg a échoué (code ${result.code}) : ${result.stderr.trim().split(/\r?\n/).slice(-3).join(" ").slice(-300)}`;

// Un recodage de 2 minutes dure ~1 min pendant un live : 10 min le disent bloqué.
const TRIM_LIMIT_MS = 10 * 60_000;

// Mesurer le son d'un clip de 2 minutes prend ~1 s : 2 min le disent bloqué. Sa sortie (80 octets par fenêtre de 50 ms) est gardée en
// entier : jusqu'à 8 Mo, soit plus d'une heure de son.
const LEVELS_LIMIT_MS = 2 * 60_000;
const LEVELS_KEPT = 8 * 1024 * 1024;

// ffprobe et ffmpeg, cherchés dans le PATH (winget les y met). Une même panne ne se journalise qu'une fois.
export function createFfmpegClient(run: ProcessRunner, log: (message: string) => void): FfmpegClient {
  const warned = new Set<string>();
  const warn = (message: string): void => {
    if (warned.has(message)) return;
    warned.add(message);
    log(message);
  };
  return {
    async trim(request) {
      try {
        const gpu = await run("ffmpeg", toTrimArgs(request, "h264_nvenc"), TRIM_LIMIT_MS);
        if (gpu.code === 0) return { ok: true, encoder: "h264_nvenc" };
        log(`Clips : h264_nvenc a échoué, repli sur libx264. ${toFailure(gpu)}`);
        const fallback = await run("ffmpeg", toTrimArgs(request, "libx264"), TRIM_LIMIT_MS);
        return fallback.code === 0
          ? { ok: true, encoder: "libx264" }
          : { ok: false, message: toFailure(fallback) };
      } catch (error) {
        return { ok: false, message: toMessage(error) };
      }
    },
    async listLevels(path) {
      try {
        const result = await run("ffmpeg", toLevelsArgs(path), LEVELS_LIMIT_MS, LEVELS_KEPT);
        if (result.code === 0) return toLevels(result.stdout);
        warn(`ffmpeg : le son de « ${path} » n'a pas pu être mesuré. ${toFailure(result)}`);
        return undefined;
      } catch (error) {
        warn(`ffmpeg : le son de « ${path} » n'a pas pu être mesuré, ${toMessage(error)}`);
        return undefined;
      }
    },
    async probe(path) {
      try {
        const result = await run(
          "ffprobe",
          [
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            path,
          ],
          PROBE_LIMIT_MS,
        );
        const seconds = Number.parseFloat(result.stdout);
        return result.code === 0 && Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
      } catch (error) {
        warn(`ffprobe : ${toMessage(error)}`);
        return undefined;
      }
    },
  };
}
