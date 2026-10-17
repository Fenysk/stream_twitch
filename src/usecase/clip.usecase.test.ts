import { describe, expect, it } from "vitest";
import type { ClipConfirmation } from "../domain/clip.schema";
import {
  type ClipAnalysis,
  type ClipEncoder,
  type ClipEntry,
  type ClipProbe,
  type ClipStore,
  type ConfirmedClip,
  createClipLibrary,
} from "./clip.usecase";

// Le son et le tchat d'un clip ne se mesurent pas ici : l'analyse est remplacée par une qui note ses demandes.
const refreshed: string[] = [];
const noAnalysis: ClipAnalysis = {
  update: () => undefined,
  refreshSpikes: async (_folder, name) => {
    refreshed.push(name);
  },
  getShowCues: async () => ({ ok: true, value: { chat: [], spikes: [], startleMs: 1000 } }),
};

const FOLDER = "C:\\clips";

// La liste et le flux ne recodent rien : valider et jeter ont leur suite de tests (clip-confirm.usecase.test.ts).
const unusedEncoder: ClipEncoder = {
  trim: async () => ({ ok: false, message: "pas de recodage dans cette suite" }),
};

const entry = (name: string, modifiedAt: number): ClipEntry => ({
  name,
  modifiedAt,
  size: 1000,
  path: `${FOLDER}\\${name}`,
});

const confirmedClip = (name: string): ConfirmedClip => ({
  ...confirmation,
  name,
  version: "1-100",
  processedName: null,
});

const confirmation: ClipConfirmation = {
  title: "Le saut",
  phrase: "Quel saut !",
  start: 1,
  end: 5,
  rawName: "raw.mp4",
  confirmedAt: "2026-10-16T10:00:00.000Z",
};

// Un faux disque : les fichiers du dossier brut, les clips confirmés, et les vidéos qu'on peut ouvrir.
const createFakeStore = (files: ClipEntry[], confirmed: ConfirmedClip[] = []) => {
  const state = { files, confirmed, missingFolder: false, opened: [] as string[] };
  const store: ClipStore = {
    pathOf: () => undefined,
    getChat: () => undefined,
    listRaw() {
      if (state.missingFolder) throw new Error("ENOENT");
      return state.files;
    },
    listConfirmed: () => state.confirmed,
    openVideo(folder, kind, name) {
      state.opened.push(`${folder}|${kind}|${name}`);
      const exists = kind === "raw" ? state.files.some((file) => file.name === name) : name === "ok.mp4";
      return exists ? { size: 42, version: "1-42", read: () => new ReadableStream<Uint8Array>() } : undefined;
    },
    updateConfirmation: () => undefined,
    planReplace: () => undefined,
    commitReplace: async () => undefined,
    withdraw: async () => undefined,
    planConfirm: () => undefined,
    commitConfirm: () => undefined,
    cancelConfirm: () => undefined,
    moveToProcessed: () => undefined,
  };
  return { store, state };
};

const createFakeProbe = (durations: Record<string, number | undefined>) => {
  const probed: string[] = [];
  const probe: ClipProbe = {
    async probe(path) {
      probed.push(path);
      return durations[path.split("\\").at(-1) ?? ""];
    },
  };
  return { probe, probed };
};

const setup = (files: ClipEntry[], durations: Record<string, number | undefined> = {}) => {
  const { store, state } = createFakeStore(files);
  const { probe, probed } = createFakeProbe(durations);
  const logs: string[] = [];
  const library = createClipLibrary({
    analysis: noAnalysis,
    store,
    probe,
    encoder: unusedEncoder,
    clock: () => 0,
    log: (line) => logs.push(line),
  });
  library.update({ showClipsFolder: FOLDER });
  return { library, state, probed, logs };
};

describe("la liste des clips bruts", () => {
  it("rend les clips du plus récent au plus ancien, avec leur date et leur durée", async () => {
    const { library } = setup(
      [entry("ancien.mp4", 1000), entry("récent.mp4", 3000), entry("notes.txt", 9000)],
      { "ancien.mp4": 118.55, "récent.mp4": 42 },
    );
    expect(await library.list()).toEqual({
      ok: true,
      value: {
        clips: [
          { name: "récent.mp4", modifiedAt: 3000, duration: 42 },
          { name: "ancien.mp4", modifiedAt: 1000, duration: 118.55 },
        ],
        confirmedCount: 0,
        confirmed: [],
      },
    });
  });

  it("compte les clips confirmés : ceux dont la vidéo et le JSON sont là", async () => {
    const { store } = createFakeStore([], [confirmedClip("a.mp4"), confirmedClip("b.mp4")]);
    const library = createClipLibrary({
      analysis: noAnalysis,
      store,
      probe: createFakeProbe({}).probe,
      encoder: unusedEncoder,
      clock: () => 0,
      log: () => undefined,
    });
    library.update({ showClipsFolder: FOLDER });
    const listed = await library.list();
    expect(listed.ok && listed.value.confirmedCount).toBe(2);
  });

  it("laisse la durée vide quand ffprobe ne la lit pas, sans cacher le clip, et réessaie à la liste suivante", async () => {
    const { library, probed } = setup([entry("cassé.mp4", 1000)], {});
    const first = await library.list();
    expect(first.ok && first.value.clips).toEqual([{ name: "cassé.mp4", modifiedAt: 1000, duration: null }]);
    await library.list();
    expect(probed).toHaveLength(2);
  });

  it("ne sonde un clip qu'une fois tant que son fichier ne change pas", async () => {
    const { library, probed, state } = setup([entry("a.mp4", 1000)], { "a.mp4": 10 });
    await library.list();
    await library.list();
    expect(probed).toHaveLength(1);
    state.files = [{ ...entry("a.mp4", 2000) }];
    await library.list();
    expect(probed).toHaveLength(2);
  });

  it("sonde plusieurs clips à la fois sans dépasser 4 sondes en parallèle", async () => {
    const files = Array.from({ length: 10 }, (_, index) => entry(`clip-${index}.mp4`, index));
    const { store } = createFakeStore(files);
    let running = 0;
    let peak = 0;
    const probe: ClipProbe = {
      async probe() {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running -= 1;
        return 10;
      },
    };
    const library = createClipLibrary({
      analysis: noAnalysis,
      store,
      probe,
      encoder: unusedEncoder,
      clock: () => 0,
      log: () => undefined,
    });
    library.update({ showClipsFolder: FOLDER });
    const listed = await library.list();
    expect(listed.ok && listed.value.clips).toHaveLength(10);
    expect(peak).toBe(4);
  });

  it("refuse avec un message clair quand le réglage manque ou que le dossier est introuvable", async () => {
    const { library, state, logs } = setup([]);
    state.missingFolder = true;
    const missing = await library.list();
    expect(missing).toEqual({
      ok: false,
      status: 404,
      message: `le dossier des clips est introuvable : ${FOLDER}`,
    });
    expect(logs.join("\n")).toContain("ENOENT");

    library.update({});
    expect(await library.list()).toEqual({
      ok: false,
      status: 503,
      message: "le dossier des clips n'est pas réglé (showClipsFolder dans settings.json)",
    });
  });
});

describe("le dossier des clips", () => {
  it("se dit dans le journal quand il change, pas à chaque réglage reçu", () => {
    const { library, logs } = setup([]);
    library.update({ showClipsFolder: FOLDER });
    library.update({ showClipsFolder: "D:\\autres" });
    library.update({});
    expect(logs).toEqual([
      `Clips : dossier « ${FOLDER} ».`,
      "Clips : dossier « D:\\autres ».",
      "Clips : dossier « non réglé ».",
    ]);
  });
});

describe("les clips confirmés", () => {
  it("rend ceux de Confirmés, et refuse tant que le dossier n'est pas réglé", () => {
    const { store } = createFakeStore([], [confirmedClip("a.mp4")]);
    const library = createClipLibrary({
      analysis: noAnalysis,
      store,
      probe: createFakeProbe({}).probe,
      encoder: unusedEncoder,
      clock: () => 0,
      log: () => undefined,
    });
    expect(library.listConfirmed().ok).toBe(false);
    library.update({ showClipsFolder: FOLDER });
    expect(library.listConfirmed()).toEqual({ ok: true, value: [confirmedClip("a.mp4")] });
  });
});

describe("le flux d'un clip", () => {
  it("rend la taille, le type et de quoi lire un intervalle pour un clip du dossier", () => {
    const { library } = setup([entry("a.mp4", 1)]);
    const video = library.getVideo("raw", "a.mp4");
    expect(video.ok && { size: video.value.size, mime: video.value.mime }).toEqual({
      size: 42,
      mime: "video/mp4",
    });
  });

  it("refuse tout ce qui n'est pas un nom de fichier vidéo, sans toucher au disque", () => {
    const { library, state } = setup([entry("a.mp4", 1)]);
    for (const name of ["../a.mp4", "C:\\Windows\\a.mp4", "sous/a.mp4", "a.txt", ""]) {
      expect(library.getVideo("raw", name)).toEqual({
        ok: false,
        status: 400,
        message: "ce n'est pas un nom de clip",
      });
    }
    expect(state.opened).toEqual([]);
  });

  it("rend 404 pour un clip qui n'est pas dans le dossier", () => {
    const { library } = setup([entry("a.mp4", 1)]);
    expect(library.getVideo("raw", "absent.mp4")).toEqual({
      ok: false,
      status: 404,
      message: "clip introuvable",
    });
  });

  it("ne sert une vidéo que si sa version est celle que la page a reçue : une vidéo remplacée depuis n'est pas servie à sa place", () => {
    const { library } = setup([entry("a.mp4", 1)]);
    expect(library.getVideo("raw", "a.mp4", "1-42").ok).toBe(true);
    expect(library.getVideo("raw", "a.mp4").ok).toBe(true);
    expect(library.getVideo("raw", "a.mp4", "1-43")).toEqual({
      ok: false,
      status: 404,
      message: "cette version du clip n'existe plus",
    });
  });

  it("ouvre les clips confirmés dans leur dossier, pas ceux du dossier brut", () => {
    const { library, state } = setup([entry("a.mp4", 1)]);
    expect(library.getVideo("confirmed", "ok.mp4").ok).toBe(true);
    expect(state.opened).toEqual([`${FOLDER}|confirmed|ok.mp4`]);
  });
});

describe("les données de l'émission d'un clip", () => {
  // Une analyse qui note ce qu'on lui demande, pour voir ce que la bibliothèque lui passe.
  const asked: string[] = [];
  const setupAnalysis = () => {
    asked.length = 0;
    const settingsSeen: (string | undefined)[] = [];
    const analysis: ClipAnalysis = {
      update: (settings) => settingsSeen.push(settings.showClipsFolder),
      refreshSpikes: async () => undefined,
      getShowCues: async (folder, name, version) => {
        asked.push(`${folder}|${name}|${version}`);
        return { ok: true, value: { chat: [], spikes: [1000], startleMs: 1000 } };
      },
    };
    const library = createClipLibrary({
      store: createFakeStore([]).store,
      probe: createFakeProbe({}).probe,
      encoder: unusedEncoder,
      analysis,
      clock: () => 0,
      log: () => undefined,
    });
    return { library, settingsSeen };
  };

  it("passe à l'analyse le dossier réglé, le nom du clip et la version que la page a reçue", async () => {
    const { library } = setupAnalysis();
    library.update({ showClipsFolder: FOLDER });
    expect(await library.getShowCues("a.mp4", "1-42")).toEqual({
      ok: true,
      value: { chat: [], spikes: [1000], startleMs: 1000 },
    });
    expect(asked).toEqual([`${FOLDER}|a.mp4|1-42`]);
  });

  it("refuse sans dossier réglé, et un nom qui n'est pas celui d'un clip, sans rien demander à l'analyse", async () => {
    const { library } = setupAnalysis();
    expect(await library.getShowCues("a.mp4")).toMatchObject({ ok: false, status: 503 });
    library.update({ showClipsFolder: FOLDER });
    expect(await library.getShowCues("../a.mp4")).toMatchObject({ ok: false, status: 400 });
    expect(asked).toEqual([]);
  });

  it("passe les réglages à l'analyse à chaque changement", () => {
    const { library, settingsSeen } = setupAnalysis();
    library.update({ showClipsFolder: FOLDER });
    library.update({ showClipsFolder: "D:\\autre" });
    expect(settingsSeen).toEqual([FOLDER, "D:\\autre"]);
  });
});
