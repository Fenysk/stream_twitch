import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isWav, toFrenchVoices } from "../domain/voice.rules";
import {
  createPowerShellRunner,
  createVoiceClient,
  type ScriptRunner,
  sweepVoiceFiles,
} from "./voice.client";

const folders: string[] = [];

const createFolder = (): string => {
  const folder = mkdtempSync(join(tmpdir(), "voice-client-"));
  folders.push(folder);
  return folder;
};

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const toCodes = (text: string) => Array.from(text, (character) => character.charCodeAt(0));

const FAKE_WAV = (() => {
  const bytes = new Uint8Array(64);
  bytes.set(toCodes("RIFF"), 0);
  bytes.set(toCodes("WAVE"), 8);
  return bytes;
})();

const counter = () => {
  let count = 0;
  return () => {
    count += 1;
    return `s${count}`;
  };
};

// Un texte piégé : guillemets de toute sorte, sous-commandes, point-virgule, accents, emoji.
const trap = (marker: string): string =>
  `Ça va ? "; Set-Content -Path '${marker}' -Value x; " $(Set-Content -Path '${marker}' -Value y) \`whoami\` ' ; & | > é à ü 😉`;

type Seen = { script: string; env: Record<string, string>; request: unknown };

describe("createVoiceClient : le texte ne touche jamais la ligne de commande", () => {
  const setup = () => {
    const directory = createFolder();
    const seen: Seen[] = [];
    const run: ScriptRunner = async (script, env) => {
      const requestPath = env.FOX_REQUEST;
      seen.push({
        script,
        env,
        request: requestPath ? JSON.parse(readFileSync(requestPath, "utf8")) : undefined,
      });
      if (env.FOX_OUT) writeFileSync(env.FOX_OUT, FAKE_WAV);
    };
    return { directory, seen, client: createVoiceClient({ directory, run, createId: counter() }) };
  };

  it("passe le texte par un fichier JSON UTF-8 : accents et emoji arrivent intacts", async () => {
    const { client, seen, directory } = setup();
    const text = trap(join(directory, "pwned.txt"));
    await client.synthesize({ text, voice: "Microsoft Claude" });
    expect(seen[0]?.request).toEqual({ text, voice: "Microsoft Claude" });
  });

  it("n'écrit le texte ni dans le script, ni dans les variables d'environnement", async () => {
    const { client, seen, directory } = setup();
    const text = trap(join(directory, "pwned.txt"));
    await client.synthesize({ text, voice: "Microsoft Claude" });
    const [call] = seen;
    expect(call?.script).not.toContain("whoami");
    expect(call?.script).not.toContain("Set-Content -Path '");
    expect(call?.script).not.toContain("😉");
    expect(Object.values(call?.env ?? {}).join("\n")).not.toContain("whoami");
    expect(Object.keys(call?.env ?? {}).sort()).toEqual(["FOX_OUT", "FOX_REQUEST"]);
  });

  it("donne le même script quel que soit le texte, et la voix aussi passe par le fichier", async () => {
    const { client, seen } = setup();
    await client.synthesize({ text: "Bonjour", voice: "Microsoft Claude" });
    await client.synthesize({ text: 'Salut "toi"', voice: 'Microsoft "Hortense"; whoami' });
    expect(seen[1]?.script).toBe(seen[0]?.script);
    expect(seen[1]?.script).not.toContain("Hortense");
    expect(seen[1]?.request).toEqual({ text: 'Salut "toi"', voice: 'Microsoft "Hortense"; whoami' });
  });

  it("rend le WAV produit, et ne laisse aucun fichier dans le dossier", async () => {
    const { client, directory } = setup();
    const bytes = await client.synthesize({ text: "Bonjour", voice: "Microsoft Claude" });
    expect(Array.from(bytes)).toEqual(Array.from(FAKE_WAV));
    expect(readdirSync(directory)).toEqual([]);
  });

  it("supprime ses fichiers aussi quand PowerShell échoue, et rend l'erreur", async () => {
    const directory = createFolder();
    const run: ScriptRunner = async (_script, env) => {
      if (env.FOX_OUT) writeFileSync(env.FOX_OUT, "à moitié écrit");
      throw new Error("PowerShell a échoué (code 1) : voix introuvable");
    };
    const client = createVoiceClient({ directory, run, createId: counter() });
    await expect(client.synthesize({ text: "Bonjour", voice: "Inconnue" })).rejects.toThrow(
      "voix introuvable",
    );
    expect(readdirSync(directory)).toEqual([]);
  });

  it("refuse une sortie qui n'est pas un WAV, et nettoie", async () => {
    const directory = createFolder();
    const run: ScriptRunner = async (_script, env) => {
      if (env.FOX_OUT)
        writeFileSync(env.FOX_OUT, "pas un wav, mais assez long pour dépasser l'en-tête d'un fichier WAV");
    };
    const client = createVoiceClient({ directory, run, createId: counter() });
    await expect(client.synthesize({ text: "Bonjour", voice: "Microsoft Claude" })).rejects.toThrow(
      "WAV valide",
    );
    expect(readdirSync(directory)).toEqual([]);
  });
});

describe("createVoiceClient : la liste des voix", () => {
  it("lit les voix écrites par le script, et nettoie son fichier", async () => {
    const directory = createFolder();
    const run: ScriptRunner = async (_script, env) => {
      writeFileSync(
        env.FOX_OUT ?? "",
        JSON.stringify([
          { name: "Microsoft Claude", language: "fr-CA" },
          { name: "Microsoft David", language: "en-US" },
        ]),
      );
    };
    const client = createVoiceClient({ directory, run, createId: counter() });
    expect(await client.list()).toEqual([
      { name: "Microsoft Claude", language: "fr-CA" },
      { name: "Microsoft David", language: "en-US" },
    ]);
    expect(readdirSync(directory)).toEqual([]);
  });

  it("refuse une liste mal formée", async () => {
    const directory = createFolder();
    const run: ScriptRunner = async (_script, env) => {
      writeFileSync(env.FOX_OUT ?? "", JSON.stringify([{ name: "Microsoft Claude" }]));
    };
    const client = createVoiceClient({ directory, run, createId: counter() });
    await expect(client.list()).rejects.toThrow();
    expect(readdirSync(directory)).toEqual([]);
  });
});

describe("sweepVoiceFiles", () => {
  it("vide les restes d'une synthèse interrompue, et seulement eux", () => {
    const directory = createFolder();
    writeFileSync(join(directory, "a1.wav"), FAKE_WAV);
    writeFileSync(join(directory, "a1.json"), "{}");
    writeFileSync(join(directory, "notes.txt"), "à garder");
    expect(sweepVoiceFiles(directory)).toBe(2);
    expect(readdirSync(directory)).toEqual(["notes.txt"]);
  });

  it("ne fait rien quand le dossier n'existe pas encore", () => {
    expect(sweepVoiceFiles(join(createFolder(), "absent"))).toBe(0);
  });
});

// Le vrai PowerShell et les vraies voix de Windows : seulement là où elles existent.
describe.skipIf(process.platform !== "win32")("avec le vrai PowerShell", () => {
  it("liste les voix installées, dont une voix française", async () => {
    const client = createVoiceClient({
      directory: createFolder(),
      run: createPowerShellRunner(),
      createId: counter(),
    });
    const voices = await client.list();
    expect(voices.length).toBeGreaterThan(0);
    expect(toFrenchVoices(voices).length).toBeGreaterThan(0);
  }, 30_000);

  it("produit un WAV valide pour un texte piégé, sans rien exécuter de ce qu'il contient, et ne laisse aucun fichier", async () => {
    const directory = createFolder();
    const client = createVoiceClient({ directory, run: createPowerShellRunner(), createId: counter() });
    const [voice] = toFrenchVoices(await client.list());
    expect(voice).toBeDefined();
    const marker = join(createFolder(), "pwned.txt");
    const bytes = await client.synthesize({ text: trap(marker), voice: voice?.name ?? "" });
    expect(isWav(bytes)).toBe(true);
    expect(bytes.length).toBeGreaterThan(10_000);
    expect(existsSync(marker)).toBe(false);
    expect(readdirSync(directory)).toEqual([]);
  }, 30_000);

  it("dit que la voix est introuvable, sans produire de fichier", async () => {
    const directory = createFolder();
    const client = createVoiceClient({ directory, run: createPowerShellRunner(), createId: counter() });
    await expect(client.synthesize({ text: "Bonjour", voice: "Microsoft Inexistante" })).rejects.toThrow(
      "voix introuvable",
    );
    expect(readdirSync(directory)).toEqual([]);
  }, 30_000);
});
