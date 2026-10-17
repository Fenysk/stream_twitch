import { describe, expect, it } from "vitest";
import type { ClipConfirmation, ConfirmRequest } from "../domain/clip.schema";
import {
  type ClipAnalysis,
  type ClipEncoder,
  type ClipProbe,
  type ClipStore,
  type ConfirmPlan,
  createClipLibrary,
  type EncodeResult,
  type TrimRequest,
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
const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);

const request: ConfirmRequest = {
  name: "Replay 2026-10-15 15-09-05.mp4",
  title: "  Le saut  ",
  phrase: "Quel saut !",
  start: 12.5,
  end: 40,
};

const plan: ConfirmPlan = {
  inputPath: `${FOLDER}\\${request.name}`,
  outputPath: `${FOLDER}\\Confirmés\\Replay 2026-10-15 15-09-05.partial`,
  name: "Replay 2026-10-15 15-09-05.mp4",
};

// Un faux disque qui note ce qu'on lui demande, dans l'ordre.
const createFakeStore = () => {
  const state = {
    calls: [] as string[],
    committed: [] as ClipConfirmation[],
    missing: false,
    commitError: undefined as Error | undefined,
    moveError: undefined as Error | undefined,
  };
  const store: ClipStore = {
    pathOf: () => undefined,
    getChat: () => undefined,
    listRaw: () => [],
    listConfirmed: () => [],
    openVideo: () => undefined,
    planConfirm(_folder, rawName) {
      state.calls.push(`plan ${rawName}`);
      return state.missing ? undefined : plan;
    },
    commitConfirm(_folder, rawName, _plan, confirmation) {
      state.calls.push(`commit ${rawName}`);
      if (state.commitError) throw state.commitError;
      state.committed.push(confirmation);
    },
    cancelConfirm() {
      state.calls.push("cancel");
    },
    updateConfirmation: () => undefined,
    planReplace: () => undefined,
    commitReplace: async () => undefined,
    withdraw: async () => undefined,
    moveToProcessed(_folder, rawName) {
      state.calls.push(`move ${rawName}`);
      if (state.moveError) throw state.moveError;
      return state.missing ? undefined : `Traités ${rawName}`;
    },
  };
  return { store, state };
};

// `isHeld` : le recodage ne finit qu'à `release.current()` (de quoi essayer un second clip pendant le premier).
const setup = (options: { duration?: number | undefined; encoded?: EncodeResult; isHeld?: boolean } = {}) => {
  refreshed.length = 0;
  const { store, state } = createFakeStore();
  const trims: TrimRequest[] = [];
  const release: { current: () => void } = { current: () => undefined };
  const encoder: ClipEncoder = {
    async trim(trimRequest) {
      trims.push(trimRequest);
      state.calls.push("encode");
      await new Promise<void>((resolve) => {
        release.current = resolve;
        if (!options.isHeld) resolve();
      });
      return options.encoded ?? { ok: true, encoder: "h264_nvenc" };
    },
  };
  const probe: ClipProbe = { probe: async () => ("duration" in options ? options.duration : 118.55) };
  const logs: string[] = [];
  const library = createClipLibrary({
    analysis: noAnalysis,
    store,
    probe,
    encoder,
    clock: () => NOW,
    log: (line) => logs.push(line),
  });
  library.update({ showClipsFolder: FOLDER });
  return { library, state, trims, logs, release };
};

describe("valider un clip", () => {
  it("recode la partie choisie, range le clip confirmé avec son JSON, puis rend son nom", async () => {
    const { library, state, trims } = setup();
    expect(await library.confirm(request)).toEqual({ ok: true, value: { name: plan.name } });
    expect(trims).toEqual([{ inputPath: plan.inputPath, outputPath: plan.outputPath, start: 12.5, end: 40 }]);
    expect(state.calls).toEqual([`plan ${request.name}`, "encode", `commit ${request.name}`]);
    expect(state.committed).toEqual([
      {
        title: "Le saut",
        phrase: "Quel saut !",
        start: 12.5,
        end: 40,
        rawName: request.name,
        confirmedAt: "2026-10-16T12:00:00.000Z",
        rawDuration: 118.55,
      },
    ]);
  });

  it("garde les rires posés dans le JSON, triés par instant, rien quand il n'y en a pas", async () => {
    const { library, state } = setup();
    await library.confirm({
      ...request,
      laughs: [
        { at: 30, sound: " abcd1234 " },
        { at: 14, sound: "efgh5678" },
      ],
    });
    await library.confirm({ ...request, laughs: [] });
    await library.confirm(request);
    expect(state.committed.map((confirmation) => confirmation.laughs)).toEqual([
      [
        { at: 14, sound: "efgh5678" },
        { at: 30, sound: "abcd1234" },
      ],
      undefined,
      undefined,
    ]);
    expect(state.committed[1]).not.toHaveProperty("laughs");
    expect(state.committed[2]).not.toHaveProperty("laughs");
  });

  it("refuse un rire qui ne désigne pas un sound, sans rien recoder", async () => {
    const { library, trims } = setup();
    expect(await library.confirm({ ...request, laughs: [{ at: 14, sound: "x".repeat(65) }] })).toEqual({
      ok: false,
      status: 400,
      message: "un rire doit désigner un sound (1 à 64 caractères)",
    });
    expect(trims).toEqual([]);
  });

  it("fait mesurer le son du clip confirmé une fois rangé, jamais quand le recodage ou le rangement échoue", async () => {
    const done = setup();
    await done.library.confirm(request);
    expect(refreshed).toEqual([plan.name]);

    const failedEncode = setup({ encoded: { ok: false, message: "ffmpeg a échoué" } });
    await failedEncode.library.confirm(request);
    expect(refreshed).toEqual([]);
    const failedCommit = setup();
    failedCommit.state.commitError = new Error("disque plein");
    await failedCommit.library.confirm(request);
    expect(refreshed).toEqual([]);
  });

  it("refuse sans rien recoder un titre vide, ou une fin au-delà de la durée lue par ffprobe", async () => {
    const { library, state, trims } = setup();
    expect(await library.confirm({ ...request, title: " " })).toEqual({
      ok: false,
      status: 400,
      message: "le titre est obligatoire",
    });
    expect(await library.confirm({ ...request, end: 300 })).toEqual({
      ok: false,
      status: 400,
      message: "la fin (300 s) dépasse la durée du clip (118.55 s)",
    });
    expect(trims).toEqual([]);
    expect(state.calls).not.toContain(`commit ${request.name}`);
  });

  it("refuse un nom qui n'est pas celui d'un fichier vidéo, sans toucher au disque", async () => {
    const { library, state } = setup();
    expect(await library.confirm({ ...request, name: "../a.mp4" })).toEqual({
      ok: false,
      status: 400,
      message: "ce n'est pas un nom de clip",
    });
    expect(state.calls).toEqual([]);
  });

  it("rend 404 pour un clip qui n'est plus dans le dossier", async () => {
    const { library, state } = setup();
    state.missing = true;
    expect(await library.confirm(request)).toEqual({ ok: false, status: 404, message: "clip introuvable" });
  });

  it("rend 502 quand ffprobe ne lit pas la durée du clip", async () => {
    const { library, trims } = setup({ duration: undefined });
    expect(await library.confirm(request)).toEqual({
      ok: false,
      status: 502,
      message: "la durée du clip est illisible (ffprobe)",
    });
    expect(trims).toEqual([]);
  });

  it("laisse le clip brut où il est quand ffmpeg échoue : le fichier partiel part, rien n'est confirmé", async () => {
    const { library, state, logs } = setup({
      encoded: { ok: false, message: "ffmpeg a échoué (code 1) : disque plein" },
    });
    expect(await library.confirm(request)).toEqual({
      ok: false,
      status: 502,
      message: "ffmpeg a échoué (code 1) : disque plein",
    });
    expect(state.calls).toEqual([`plan ${request.name}`, "encode", "cancel"]);
    expect(state.committed).toEqual([]);
    expect(logs.join("\n")).toContain("disque plein");
  });

  it("annule le clip confirmé quand son rangement échoue, et le dit", async () => {
    const { library, state } = setup();
    state.commitError = new Error("EPERM");
    expect(await library.confirm(request)).toEqual({
      ok: false,
      status: 502,
      message: "le clip n'a pas pu être rangé : EPERM",
    });
    expect(state.calls).toEqual([`plan ${request.name}`, "encode", `commit ${request.name}`, "cancel"]);
  });

  it("ne traite qu'un clip à la fois : le second attend un 409, puis tout repart", async () => {
    const { library, release } = setup({ isHeld: true });
    const first = library.confirm(request);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await library.confirm({ ...request, name: "autre.mp4" })).toEqual({
      ok: false,
      status: 409,
      message: "un clip est déjà en cours de traitement",
    });
    expect(await library.discard("autre.mp4")).toEqual({
      ok: false,
      status: 409,
      message: "un clip est déjà en cours de traitement",
    });
    release.current();
    expect((await first).ok).toBe(true);
    expect((await library.discard("autre.mp4")).ok).toBe(true);
  });

  it("n'accepte rien tant que le dossier des clips n'est pas réglé", async () => {
    const { library } = setup();
    library.update({});
    const refused = await library.confirm(request);
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.status).toBe(503);
  });
});

describe("jeter un clip", () => {
  it("range le clip brut dans Traités sans clip confirmé, et rend son nom", async () => {
    const { library, state } = setup();
    expect(await library.discard(request.name)).toEqual({
      ok: true,
      value: { name: `Traités ${request.name}` },
    });
    expect(state.calls).toEqual([`move ${request.name}`]);
  });

  it("rend 404 pour un clip qui n'est plus dans le dossier, 400 pour un nom qui n'est pas un clip", async () => {
    const { library, state } = setup();
    state.missing = true;
    expect(await library.discard(request.name)).toEqual({
      ok: false,
      status: 404,
      message: "clip introuvable",
    });
    expect(await library.discard("a/b.mp4")).toEqual({
      ok: false,
      status: 400,
      message: "ce n'est pas un nom de clip",
    });
  });

  it("rend 502 avec la cause quand le rangement échoue, le clip reste où il est", async () => {
    const { library, state } = setup();
    state.moveError = new Error("EBUSY");
    expect(await library.discard(request.name)).toEqual({
      ok: false,
      status: 502,
      message: "le clip n'a pas pu être rangé : EBUSY",
    });
  });
});
