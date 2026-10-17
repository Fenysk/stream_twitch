import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ClipConfirmation } from "../domain/clip.schema";
import { CONFIRMED_FOLDER, createClipChatStore, createClipStore, PROCESSED_FOLDER } from "./clip.repository";

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const confirmation: ClipConfirmation = {
  title: "Le saut",
  phrase: "Quel saut !",
  start: 1,
  end: 5,
  rawName: "raw.mp4",
  confirmedAt: "2026-10-16T10:00:00.000Z",
};

// Un dossier de clips jetable : jamais le vrai dossier d'Alexis.
const setup = () => {
  const folder = mkdtempSync(join(tmpdir(), "clips-"));
  folders.push(folder);
  const logs: string[] = [];
  return { folder, logs, store: createClipStore((line) => logs.push(line)) };
};

const getBytes = async (stream: ReadableStream<Uint8Array>): Promise<number[]> => {
  const bytes: number[] = [];
  const reader = stream.getReader();
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) bytes.push(...chunk.value);
  return bytes;
};

describe("la liste du dossier des clips", () => {
  it("rend les fichiers vidéo directement dans le dossier, pas ceux de ses sous-dossiers ni les autres fichiers", () => {
    const { folder, store } = setup();
    writeFileSync(join(folder, "Replay 2026-10-15 15-09-05.mp4"), "12345");
    writeFileSync(join(folder, "autre.mkv"), "12");
    writeFileSync(join(folder, "notes.txt"), "texte");
    writeFileSync(join(folder, "Replay 2026-10-15 15-09-05.chat.json"), "{}");
    mkdirSync(join(folder, "Traités"));
    writeFileSync(join(folder, "Traités", "vieux.mp4"), "1");
    mkdirSync(join(folder, "faux.mp4"));

    const listed = store.listRaw(folder);
    expect(
      listed.map(({ name, size }) => ({ name, size })).sort((a, b) => a.name.localeCompare(b.name)),
    ).toEqual([
      { name: "autre.mkv", size: 2 },
      { name: "Replay 2026-10-15 15-09-05.mp4", size: 5 },
    ]);
    expect(listed[0]?.path.startsWith(folder)).toBe(true);
    expect(listed.every(({ modifiedAt }) => modifiedAt > 0)).toBe(true);
  });

  it("lève quand le dossier n'existe pas : le usecase le dit à Alexis", () => {
    const { folder, store } = setup();
    expect(() => store.listRaw(join(folder, "absent"))).toThrow();
  });
});

describe("les clips confirmés", () => {
  it("ne rend que les vidéos de Confirmés qui ont leur JSON, avec ce qu'il dit", () => {
    const { folder, store } = setup();
    const confirmed = join(folder, CONFIRMED_FOLDER);
    mkdirSync(confirmed);
    writeFileSync(join(confirmed, "a.mp4"), "video");
    writeFileSync(join(confirmed, "a.json"), JSON.stringify(confirmation));
    writeFileSync(join(confirmed, "a.chat.json"), "{}");
    writeFileSync(join(confirmed, "sans-json.mp4"), "video");
    writeFileSync(join(confirmed, "sans-video.json"), JSON.stringify(confirmation));

    expect(store.listConfirmed(folder)).toEqual([
      { ...confirmation, name: "a.mp4", version: expect.stringMatching(/^[0-9]+-5$/), processedName: null },
    ]);
  });

  it("ignore un JSON abîmé ou invalide et le dit une seule fois", () => {
    const { folder, store, logs } = setup();
    const confirmed = join(folder, CONFIRMED_FOLDER);
    mkdirSync(confirmed);
    writeFileSync(join(confirmed, "b.mp4"), "video");
    writeFileSync(join(confirmed, "b.json"), "{ pas du json");
    writeFileSync(join(confirmed, "c.mp4"), "video");
    writeFileSync(join(confirmed, "c.json"), JSON.stringify({ title: "sans le reste" }));

    expect(store.listConfirmed(folder)).toEqual([]);
    expect(store.listConfirmed(folder)).toEqual([]);
    expect(logs).toHaveLength(2);
    expect(logs.join("\n")).toContain("b.json");
    expect(logs.join("\n")).toContain("c.json");
  });

  it("rend une liste vide tant que Confirmés n'existe pas", () => {
    const { folder, store } = setup();
    expect(store.listConfirmed(folder)).toEqual([]);
  });

  it("rend les rires et leur volume, la durée du clip brut, les spikes et le nombre de passages que le JSON garde", () => {
    const { folder, store } = setup();
    const confirmed = join(folder, CONFIRMED_FOLDER);
    mkdirSync(confirmed);
    writeFileSync(join(confirmed, "a.mp4"), "video");
    const kept = {
      ...confirmation,
      laughs: [
        { at: 2.5, sound: "abcd1234" },
        { at: 4, sound: "efgh5678" },
      ],
      laughFader: 40,
      rawDuration: 118.55,
      spikes: [1000, 5000],
      playCount: 2,
    };
    writeFileSync(join(confirmed, "a.json"), JSON.stringify(kept));
    expect(store.listConfirmed(folder)[0]).toMatchObject(kept);
  });

  it("lit l'ancien `laugh` d'un JSON d'avant comme un rire posé à la fin du clip, et ne le rend plus", () => {
    const { folder, store, logs } = setup();
    const confirmed = join(folder, CONFIRMED_FOLDER);
    mkdirSync(confirmed);
    writeFileSync(join(confirmed, "a.mp4"), "video");
    writeFileSync(join(confirmed, "a.json"), JSON.stringify({ ...confirmation, laugh: "abcd1234" }));
    const [clip] = store.listConfirmed(folder);
    expect(clip?.laughs).toEqual([{ at: 5, sound: "abcd1234" }]);
    expect(clip).not.toHaveProperty("laugh");
    expect(logs).toEqual([]);
  });

  it("réécrit un ancien JSON avec `laughs` : la prochaine écriture n'écrit plus `laugh`", () => {
    const { folder, store } = setup();
    const confirmed = join(folder, CONFIRMED_FOLDER);
    mkdirSync(confirmed);
    writeFileSync(join(confirmed, "a.mp4"), "video");
    writeFileSync(join(confirmed, "a.json"), JSON.stringify({ ...confirmation, laugh: "abcd1234" }));
    const [clip] = store.listConfirmed(folder);
    if (!clip) throw new Error("le clip confirmé manque");
    const { name, version, processedName, ...stored } = clip;
    store.updateConfirmation(folder, name, stored);
    const written = JSON.parse(readFileSync(join(confirmed, "a.json"), "utf8"));
    expect(written.laughs).toEqual([{ at: 5, sound: "abcd1234" }]);
    expect(written).not.toHaveProperty("laugh");
  });
});

describe("le chemin d'une vidéo et le tchat d'un clip confirmé", () => {
  const chat = {
    savedAt: 1_000_000,
    messages: [
      {
        id: "m1",
        nickname: "Viewer",
        color: null,
        fragments: [{ kind: "text", text: "salut" }],
        isHidden: false,
        receivedAt: 900_000,
      },
    ],
  };

  it("donne le chemin de la vidéo du dossier brut, de Confirmés ou de Traités, et rien pour une vidéo absente", () => {
    const { folder, store } = setup();
    mkdirSync(join(folder, CONFIRMED_FOLDER));
    mkdirSync(join(folder, PROCESSED_FOLDER));
    writeFileSync(join(folder, "brut.mp4"), "1");
    writeFileSync(join(folder, CONFIRMED_FOLDER, "a.mp4"), "1");
    writeFileSync(join(folder, PROCESSED_FOLDER, "vu.mp4"), "1");
    expect(store.pathOf(folder, "raw", "brut.mp4")).toBe(join(folder, "brut.mp4"));
    expect(store.pathOf(folder, "confirmed", "a.mp4")).toBe(join(folder, CONFIRMED_FOLDER, "a.mp4"));
    expect(store.pathOf(folder, "processed", "vu.mp4")).toBe(join(folder, PROCESSED_FOLDER, "vu.mp4"));
    expect(store.pathOf(folder, "confirmed", "absent.mp4")).toBeUndefined();
    expect(store.pathOf(folder, "confirmed", "../brut.mp4")).toBeUndefined();
  });

  it("lit le tchat gardé à côté du clip confirmé", () => {
    const { folder, store } = setup();
    const confirmed = join(folder, CONFIRMED_FOLDER);
    mkdirSync(confirmed);
    writeFileSync(join(confirmed, "a.mp4"), "video");
    writeFileSync(join(confirmed, "a.chat.json"), JSON.stringify(chat));
    expect(store.getChat(folder, "a.mp4")).toEqual(chat);
  });

  it("ne rend rien d'un clip sans tchat, ni d'un tchat abîmé ou invalide (dit une seule fois)", () => {
    const { folder, store, logs } = setup();
    const confirmed = join(folder, CONFIRMED_FOLDER);
    mkdirSync(confirmed);
    writeFileSync(join(confirmed, "b.chat.json"), "{ pas du json");
    writeFileSync(join(confirmed, "c.chat.json"), JSON.stringify({ savedAt: "hier" }));
    expect(store.getChat(folder, "a.mp4")).toBeUndefined();
    expect(store.getChat(folder, "b.mp4")).toBeUndefined();
    expect(store.getChat(folder, "b.mp4")).toBeUndefined();
    expect(store.getChat(folder, "c.mp4")).toBeUndefined();
    expect(logs).toHaveLength(2);
    expect(logs.join("\n")).toContain("b.chat.json");
  });
});

describe("ouvrir une vidéo", () => {
  it("lit l'intervalle d'octets demandé, bornes comprises, sans lire le reste", async () => {
    const { folder, store } = setup();
    writeFileSync(join(folder, "a.mp4"), Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
    const source = store.openVideo(folder, "raw", "a.mp4");
    expect(source?.size).toBe(10);
    expect(await getBytes(source?.read(2, 5) ?? new ReadableStream())).toEqual([2, 3, 4, 5]);
    expect(await getBytes(source?.read(0, 9) ?? new ReadableStream())).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it("ouvre les clips confirmés dans Confirmés, pas dans le dossier brut", () => {
    const { folder, store } = setup();
    writeFileSync(join(folder, "brut.mp4"), "1");
    mkdirSync(join(folder, CONFIRMED_FOLDER));
    writeFileSync(join(folder, CONFIRMED_FOLDER, "fini.mp4"), "12");
    expect(store.openVideo(folder, "raw", "fini.mp4")).toBeUndefined();
    expect(store.openVideo(folder, "confirmed", "brut.mp4")).toBeUndefined();
    expect(store.openVideo(folder, "confirmed", "fini.mp4")?.size).toBe(2);
  });

  it("n'ouvre rien qui ne soit pas un fichier vidéo direct du dossier : remontée, sous-dossier, chemin absolu, dossier, fichier absent", () => {
    const { folder, store } = setup();
    writeFileSync(join(folder, "a.mp4"), "1");
    mkdirSync(join(folder, "Traités"));
    writeFileSync(join(folder, "Traités", "vieux.mp4"), "1");
    mkdirSync(join(folder, "dossier.mp4"));
    const outside = join(tmpdir(), "hors-du-dossier.mp4");
    for (const name of [
      "../a.mp4",
      "Traités/vieux.mp4",
      "Traités\\vieux.mp4",
      outside,
      "dossier.mp4",
      "absent.mp4",
      "a.txt",
    ]) {
      expect(store.openVideo(folder, "raw", name)).toBeUndefined();
    }
  });

  it("n'ouvre rien quand Confirmés n'existe pas encore", () => {
    const { folder, store } = setup();
    expect(store.openVideo(folder, "confirmed", "a.mp4")).toBeUndefined();
  });
});

const names = (folder: string): string[] => (existsSync(folder) ? readdirSync(folder).sort() : []);

describe("préparer la validation d'un clip", () => {
  it("crée Confirmés s'il manque et donne le fichier partiel et le nom définitif du clip confirmé, toujours en .mp4", () => {
    const { folder, store } = setup();
    writeFileSync(join(folder, "Replay.mkv"), "brut");
    const plan = store.planConfirm(folder, "Replay.mkv");
    expect(plan).toEqual({
      inputPath: join(folder, "Replay.mkv"),
      outputPath: join(folder, CONFIRMED_FOLDER, "Replay.partial"),
      name: "Replay.mp4",
    });
    expect(existsSync(join(folder, CONFIRMED_FOLDER))).toBe(true);
  });

  it("choisit un nom libre quand le clip, son JSON ou son chat existent déjà dans Confirmés : rien n'est écrasé", () => {
    const { folder, store } = setup();
    writeFileSync(join(folder, "Replay.mp4"), "brut");
    mkdirSync(join(folder, CONFIRMED_FOLDER));
    writeFileSync(join(folder, CONFIRMED_FOLDER, "Replay.mp4"), "déjà là");
    writeFileSync(join(folder, CONFIRMED_FOLDER, "Replay (2).json"), "{}");
    expect(store.planConfirm(folder, "Replay.mp4")?.name).toBe("Replay (3).mp4");
  });

  it("laisse un fichier partiel d'un recodage interrompu sans prendre le nom : le prochain le remplace", () => {
    const { folder, store } = setup();
    writeFileSync(join(folder, "Replay.mp4"), "brut");
    mkdirSync(join(folder, CONFIRMED_FOLDER));
    writeFileSync(join(folder, CONFIRMED_FOLDER, "Replay.partial"), "reste");
    expect(store.planConfirm(folder, "Replay.mp4")?.name).toBe("Replay.mp4");
  });

  it("ne prépare rien pour un clip qui n'est pas directement dans le dossier", () => {
    const { folder, store } = setup();
    mkdirSync(join(folder, "Traités"));
    writeFileSync(join(folder, "Traités", "vieux.mp4"), "1");
    expect(store.planConfirm(folder, "absent.mp4")).toBeUndefined();
    expect(store.planConfirm(folder, "Traités/vieux.mp4")).toBeUndefined();
    expect(store.planConfirm(folder, "../x.mp4")).toBeUndefined();
  });
});

describe("ranger un clip validé", () => {
  const prepare = () => {
    const context = setup();
    writeFileSync(join(context.folder, "Replay.mp4"), "brut");
    const plan = context.store.planConfirm(context.folder, "Replay.mp4");
    if (!plan) throw new Error("le plan manque");
    writeFileSync(plan.outputPath, "recodé");
    return { ...context, plan };
  };

  it("fait du fichier partiel le clip confirmé, écrit son JSON à côté, et range le clip brut dans Traités", () => {
    const { folder, store, plan } = prepare();
    store.commitConfirm(folder, "Replay.mp4", plan, confirmation);
    expect(names(join(folder, CONFIRMED_FOLDER))).toEqual(["Replay.json", "Replay.mp4"]);
    expect(readFileSync(join(folder, CONFIRMED_FOLDER, "Replay.mp4"), "utf8")).toBe("recodé");
    // Le JSON garde aussi le nom que le clip brut prend dans Traités : le lien survit à un renommage.
    expect(JSON.parse(readFileSync(join(folder, CONFIRMED_FOLDER, "Replay.json"), "utf8"))).toEqual({
      ...confirmation,
      processedName: "Replay.mp4",
    });
    expect(names(join(folder, PROCESSED_FOLDER))).toEqual(["Replay.mp4"]);
    expect(existsSync(join(folder, "Replay.mp4"))).toBe(false);
  });

  it("copie le chat du clip à côté du clip confirmé et déplace l'original avec le clip brut", () => {
    const { folder, store, plan } = prepare();
    writeFileSync(join(folder, "Replay.chat.json"), '{"savedAt":1,"messages":[]}');
    store.commitConfirm(folder, "Replay.mp4", plan, confirmation);
    expect(names(join(folder, CONFIRMED_FOLDER))).toEqual(["Replay.chat.json", "Replay.json", "Replay.mp4"]);
    expect(readFileSync(join(folder, CONFIRMED_FOLDER, "Replay.chat.json"), "utf8")).toBe(
      '{"savedAt":1,"messages":[]}',
    );
    expect(names(join(folder, PROCESSED_FOLDER))).toEqual(["Replay.chat.json", "Replay.mp4"]);
    expect(existsSync(join(folder, "Replay.chat.json"))).toBe(false);
  });

  it("ne range rien et rend le clip brut intact quand le recodage n'a rien produit", () => {
    const { folder, store, plan } = prepare();
    rmSync(plan.outputPath);
    expect(() => store.commitConfirm(folder, "Replay.mp4", plan, confirmation)).toThrow();
    expect(names(folder)).toContain("Replay.mp4");
    expect(names(join(folder, CONFIRMED_FOLDER))).toEqual([]);
    expect(existsSync(join(folder, PROCESSED_FOLDER))).toBe(false);
  });

  it("retire le clip confirmé et son JSON quand Traités est inutilisable : le clip brut reste, entier", () => {
    const { folder, store, plan } = prepare();
    writeFileSync(join(folder, "Replay.chat.json"), "{}");
    writeFileSync(join(folder, PROCESSED_FOLDER), "un fichier à la place du dossier");
    expect(() => store.commitConfirm(folder, "Replay.mp4", plan, confirmation)).toThrow();
    expect(names(join(folder, CONFIRMED_FOLDER))).toEqual([]);
    expect(readFileSync(join(folder, "Replay.mp4"), "utf8")).toBe("brut");
    expect(existsSync(join(folder, "Replay.chat.json"))).toBe(true);
  });

  it("supprime le fichier partiel d'un recodage raté, et lui seul", () => {
    const { folder, store, plan } = prepare();
    writeFileSync(join(folder, CONFIRMED_FOLDER, "Autre.mp4"), "à garder");
    store.cancelConfirm(plan);
    expect(names(join(folder, CONFIRMED_FOLDER))).toEqual(["Autre.mp4"]);
    expect(names(folder)).toContain("Replay.mp4");
  });
});

describe("jeter un clip", () => {
  it("range le clip brut et son chat dans Traités, sous leur nom, sans rien confirmer", () => {
    const { folder, store } = setup();
    writeFileSync(join(folder, "Replay.mp4"), "brut");
    writeFileSync(join(folder, "Replay.chat.json"), "{}");
    expect(store.moveToProcessed(folder, "Replay.mp4")).toBe("Replay.mp4");
    expect(names(join(folder, PROCESSED_FOLDER))).toEqual(["Replay.chat.json", "Replay.mp4"]);
    expect(names(folder)).toEqual([PROCESSED_FOLDER]);
    expect(existsSync(join(folder, CONFIRMED_FOLDER))).toBe(false);
  });

  it("prend un nom libre dans Traités quand le clip y est déjà (un clip jamais écrasé), chat compris", () => {
    const { folder, store } = setup();
    mkdirSync(join(folder, PROCESSED_FOLDER));
    writeFileSync(join(folder, PROCESSED_FOLDER, "Replay.mp4"), "ancien");
    writeFileSync(join(folder, "Replay.mp4"), "nouveau");
    writeFileSync(join(folder, "Replay.chat.json"), "{}");
    expect(store.moveToProcessed(folder, "Replay.mp4")).toBe("Replay (2).mp4");
    expect(readFileSync(join(folder, PROCESSED_FOLDER, "Replay.mp4"), "utf8")).toBe("ancien");
    expect(readFileSync(join(folder, PROCESSED_FOLDER, "Replay (2).mp4"), "utf8")).toBe("nouveau");
    expect(existsSync(join(folder, PROCESSED_FOLDER, "Replay (2).chat.json"))).toBe(true);
  });

  it("ne bouge rien pour un clip absent ou un nom qui n'est pas un clip du dossier", () => {
    const { folder, store } = setup();
    writeFileSync(join(folder, "Replay.mp4"), "brut");
    expect(store.moveToProcessed(folder, "absent.mp4")).toBeUndefined();
    expect(store.moveToProcessed(folder, "../Replay.mp4")).toBeUndefined();
    expect(names(folder)).toEqual(["Replay.mp4"]);
  });
});

describe("garder le tchat d'un clip", () => {
  const chat = {
    savedAt: 1_000_000,
    messages: [
      {
        id: "1",
        nickname: "Viewer",
        color: null,
        fragments: [{ kind: "text" as const, text: "salut" }],
        isHidden: false,
        receivedAt: 999_000,
      },
    ],
  };

  it("écrit `<nom du clip sans extension>.chat.json` à côté du clip, avec l'heure de la sauvegarde et les messages", () => {
    const { folder } = setup();
    writeFileSync(join(folder, "Replay 2026-10-15 15-09-05.mp4"), "brut");
    expect(createClipChatStore().create(folder, join(folder, "Replay 2026-10-15 15-09-05.mp4"), chat)).toBe(
      "written",
    );
    expect(names(folder)).toEqual(["Replay 2026-10-15 15-09-05.chat.json", "Replay 2026-10-15 15-09-05.mp4"]);
    expect(JSON.parse(readFileSync(join(folder, "Replay 2026-10-15 15-09-05.chat.json"), "utf8"))).toEqual(
      chat,
    );
  });

  it("reconnaît le chemin que donne OBS (avec des /, ou en majuscules) comme celui du dossier réglé", () => {
    const { folder } = setup();
    writeFileSync(join(folder, "a.mp4"), "brut");
    const obsPath = join(folder, "a.mp4").replaceAll("\\", "/");
    expect(createClipChatStore().create(folder, obsPath, chat)).toBe("written");
    if (process.platform === "win32") {
      expect(createClipChatStore().create(folder.toUpperCase(), obsPath, chat)).toBe("written");
    }
  });

  it("n'écrit rien pour un clip hors du dossier des clips, ni dans un de ses sous-dossiers", () => {
    const { folder } = setup();
    const other = setup().folder;
    writeFileSync(join(other, "a.mp4"), "brut");
    mkdirSync(join(folder, PROCESSED_FOLDER));
    writeFileSync(join(folder, PROCESSED_FOLDER, "b.mp4"), "brut");
    expect(createClipChatStore().create(folder, join(other, "a.mp4"), chat)).toBe("outside");
    expect(createClipChatStore().create(folder, join(folder, PROCESSED_FOLDER, "b.mp4"), chat)).toBe(
      "outside",
    );
    expect(names(other)).toEqual(["a.mp4"]);
    expect(names(join(folder, PROCESSED_FOLDER))).toEqual(["b.mp4"]);
  });

  it("n'écrit rien pour un clip disparu ou qui n'est pas une vidéo", () => {
    const { folder } = setup();
    writeFileSync(join(folder, "notes.txt"), "texte");
    expect(createClipChatStore().create(folder, join(folder, "absent.mp4"), chat)).toBe("missing");
    expect(createClipChatStore().create(folder, join(folder, "notes.txt"), chat)).toBe("missing");
    expect(names(folder)).toEqual(["notes.txt"]);
  });
});
