import { describe, expect, it } from "vitest";
import type { ClipConfirmation, ConfirmRequest } from "../domain/clip.schema";
import {
  type ClipAnalysis,
  type ClipEncoder,
  type ClipProbe,
  type ClipStore,
  type ConfirmedClip,
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
const NOW = Date.UTC(2026, 9, 17, 9, 0, 0);

const clip: ConfirmedClip = {
  title: "Le saut",
  phrase: "Quel saut !",
  start: 12.5,
  end: 40,
  rawName: "Replay.mp4",
  confirmedAt: "2026-10-16T10:00:00.000Z",
  name: "Replay.mp4",
  version: "1-100",
  processedName: "Replay (2).mp4",
};

const request: ConfirmRequest = {
  name: "Replay.mp4",
  title: "  Un autre titre ",
  phrase: " Une autre phrase ",
  start: 12.5,
  end: 40,
};

// Un faux disque qui garde les clips confirmés en mémoire et note ce qu'on lui demande, dans l'ordre.
const setup = (
  options: {
    confirmed?: ConfirmedClip[];
    duration?: number | undefined;
    encoded?: EncodeResult;
    isHeld?: boolean;
  } = {},
) => {
  refreshed.length = 0;
  const state = {
    confirmed: options.confirmed ?? [clip],
    calls: [] as string[],
    updated: [] as { name: string; confirmation: ClipConfirmation }[],
    replaced: [] as { plan: ConfirmPlan; confirmation: ClipConfirmation }[],
    commitError: undefined as Error | undefined,
    withdrawError: undefined as Error | undefined,
    updateError: undefined as Error | undefined,
  };
  const store: ClipStore = {
    pathOf: () => undefined,
    getChat: () => undefined,
    listRaw: () => [],
    listConfirmed: () => state.confirmed,
    openVideo: () => undefined,
    planConfirm: () => undefined,
    commitConfirm: () => undefined,
    cancelConfirm() {
      state.calls.push("cancel");
    },
    moveToProcessed: () => undefined,
    updateConfirmation(_folder, name, confirmation) {
      if (state.updateError) throw state.updateError;
      state.calls.push(`json ${name}`);
      state.updated.push({ name, confirmation });
    },
    planReplace(_folder, name, processedName) {
      state.calls.push(`plan ${name} depuis ${processedName}`);
      return {
        inputPath: `${FOLDER}\\Traités\\${processedName}`,
        outputPath: `${FOLDER}\\Confirmés\\Replay.partial`,
        name,
      };
    },
    async commitReplace(_folder, plan, confirmation) {
      state.calls.push("remplace");
      if (state.commitError) throw state.commitError;
      state.replaced.push({ plan, confirmation });
    },
    async withdraw(_folder, name) {
      state.calls.push(`retire ${name}`);
      if (state.withdrawError) throw state.withdrawError;
      return `${name.replace(".mp4", "")} (2).mp4`;
    },
  };
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

describe("modifier le titre et la phrase d'un clip confirmé", () => {
  it("réécrit le JSON sans recoder, en gardant le reste tel quel : date de validation, clip brut, début et fin", async () => {
    const { library, state, trims } = setup();
    expect(await library.revise(request)).toEqual({ ok: true, value: { name: "Replay.mp4" } });
    expect(trims).toEqual([]);
    expect(state.calls).toEqual(["json Replay.mp4"]);
    expect(state.updated).toEqual([
      {
        name: "Replay.mp4",
        confirmation: {
          title: "Un autre titre",
          phrase: "Une autre phrase",
          start: 12.5,
          end: 40,
          rawName: "Replay.mp4",
          processedName: "Replay (2).mp4",
          confirmedAt: "2026-10-16T10:00:00.000Z",
        },
      },
    ]);
  });

  it("accepte une phrase vide : Jean-Renard se taira", async () => {
    const { library, state } = setup();
    expect((await library.revise({ ...request, phrase: "" })).ok).toBe(true);
    expect(state.updated[0]?.confirmation.phrase).toBe("");
  });

  it("marche aussi quand le clip brut n'est plus dans Traités : seuls le titre et la phrase changent", async () => {
    const { library, state } = setup({ confirmed: [{ ...clip, processedName: null }] });
    expect((await library.revise(request)).ok).toBe(true);
    expect(state.updated[0]?.confirmation).not.toHaveProperty("processedName");
  });

  it("reconnaît le même début et la même fin à un millième de seconde près : pas de recodage", async () => {
    const { library, trims } = setup();
    expect((await library.revise({ ...request, start: 12.5004, end: 39.9996 })).ok).toBe(true);
    expect(trims).toEqual([]);
  });

  it("refuse un titre vide, sans rien écrire", async () => {
    const { library, state } = setup();
    expect(await library.revise({ ...request, title: "  " })).toEqual({
      ok: false,
      status: 400,
      message: "le titre est obligatoire",
    });
    expect(state.updated).toEqual([]);
  });
});

describe("les rires d'un clip confirmé", () => {
  const first = { at: 14, sound: "abcd1234" };
  const second = { at: 30, sound: "efgh5678" };

  it("remplace les rires sans recoder, triés par instant, et garde le reste du JSON : spikes, durée du clip brut, nombre de passages", async () => {
    const { library, state, trims } = setup({
      confirmed: [{ ...clip, spikes: [1000], rawDuration: 100, playCount: 3 }],
    });
    await library.revise({ ...request, laughs: [second, first] });
    expect(trims).toEqual([]);
    expect(state.updated[0]?.confirmation).toMatchObject({
      laughs: [first, second],
      spikes: [1000],
      rawDuration: 100,
      playCount: 3,
    });
  });

  it("retire les rires quand la demande n'en a pas : une demande sans rires efface ceux du JSON", async () => {
    const { library, state } = setup({ confirmed: [{ ...clip, laughs: [first] }] });
    await library.revise(request);
    await library.revise({ ...request, laughs: [] });
    expect(state.updated).toHaveLength(2);
    for (const { confirmation } of state.updated) expect(confirmation).not.toHaveProperty("laughs");
  });

  it("garde un rire hors de la partie gardée, sans refuser l'enregistrement : une recoupe peut le ramener dedans", async () => {
    const { library, state } = setup();
    const outside = { at: 90, sound: "abcd1234" };
    expect((await library.revise({ ...request, laughs: [outside] })).ok).toBe(true);
    expect(state.updated[0]?.confirmation.laughs).toEqual([outside]);
  });

  it("n'a pas besoin du clip brut pour changer les rires : seul le début ou la fin le demandent", async () => {
    const { library, state } = setup({ confirmed: [{ ...clip, processedName: null }] });
    expect((await library.revise({ ...request, laughs: [first] })).ok).toBe(true);
    expect(state.updated[0]?.confirmation.laughs).toEqual([first]);
  });
});

describe("le volume des rires d'un clip confirmé", () => {
  it("règle le volume sans recoder, et garde le reste du JSON", async () => {
    const { library, state, trims } = setup({
      confirmed: [{ ...clip, laughs: [{ at: 14, sound: "abcd1234" }], spikes: [1000], playCount: 3 }],
    });
    expect(
      (await library.revise({ ...request, laughs: [{ at: 14, sound: "abcd1234" }], laughFader: 40 })).ok,
    ).toBe(true);
    expect(trims).toEqual([]);
    expect(state.updated[0]?.confirmation).toMatchObject({ laughFader: 40, spikes: [1000], playCount: 3 });
  });

  it("n'a pas besoin du clip brut pour le changer", async () => {
    const { library, state } = setup({ confirmed: [{ ...clip, processedName: null }] });
    expect((await library.revise({ ...request, laughFader: 0 })).ok).toBe(true);
    expect(state.updated[0]?.confirmation.laughFader).toBe(0);
  });

  it("l'efface quand la demande n'en a pas : absent vaut 100", async () => {
    const { library, state } = setup({ confirmed: [{ ...clip, laughFader: 40 }] });
    await library.revise(request);
    expect(state.updated[0]?.confirmation).not.toHaveProperty("laughFader");
  });

  it("refuse un volume qui n'est pas un entier de 0 à 100, sans rien écrire", async () => {
    const { library, state } = setup();
    expect(await library.revise({ ...request, laughFader: 101 })).toEqual({
      ok: false,
      status: 400,
      message: "le volume des rires doit être un nombre entier de 0 à 100",
    });
    expect(state.updated).toEqual([]);
  });

  it("l'applique aussi quand le début ou la fin changent : le JSON recodé le garde", async () => {
    const { library, state } = setup();
    await library.revise({ ...request, start: 20, end: 50, laughFader: 70 });
    expect(state.replaced[0]?.confirmation).toMatchObject({ laughFader: 70 });
  });
});

describe("changer le début ou la fin d'un clip confirmé", () => {
  const moved = { ...request, start: 20, end: 50 };

  it("recode depuis le clip brut de Traités (celui que le JSON désigne, renommé compris), puis remplace la vidéo et le JSON", async () => {
    const { library, state, trims } = setup();
    expect(await library.revise(moved)).toEqual({ ok: true, value: { name: "Replay.mp4" } });
    expect(trims).toEqual([
      {
        inputPath: "C:\\clips\\Traités\\Replay (2).mp4",
        outputPath: "C:\\clips\\Confirmés\\Replay.partial",
        start: 20,
        end: 50,
      },
    ]);
    expect(state.calls).toEqual(["plan Replay.mp4 depuis Replay (2).mp4", "encode", "remplace"]);
    expect(state.replaced[0]?.confirmation).toEqual({
      title: "Un autre titre",
      phrase: "Une autre phrase",
      start: 20,
      end: 50,
      rawName: "Replay.mp4",
      processedName: "Replay (2).mp4",
      confirmedAt: "2026-10-16T10:00:00.000Z",
      rawDuration: 118.55,
    });
  });

  it("jette les spikes de l'ancienne vidéo, applique les rires choisis, et fait mesurer le son de la nouvelle", async () => {
    const { library, state } = setup({
      confirmed: [{ ...clip, spikes: [1000], rawDuration: 100, laughs: [{ at: 14, sound: "ancien01" }] }],
    });
    await library.revise({ ...moved, laughs: [{ at: 30, sound: "nouveau1" }] });
    expect(state.replaced[0]?.confirmation).not.toHaveProperty("spikes");
    expect(state.replaced[0]?.confirmation).toMatchObject({
      laughs: [{ at: 30, sound: "nouveau1" }],
      rawDuration: 118.55,
    });
    expect(refreshed).toEqual(["Replay.mp4"]);
  });

  it("ne fait pas mesurer le son quand le recodage échoue", async () => {
    const { library } = setup({ encoded: { ok: false, message: "ffmpeg a échoué" } });
    await library.revise(moved);
    expect(refreshed).toEqual([]);
  });

  it("refuse quand le clip brut n'est plus dans Traités : 409, rien n'est recodé", async () => {
    const { library, state, trims } = setup({ confirmed: [{ ...clip, processedName: null }] });
    expect(await library.revise(moved)).toEqual({
      ok: false,
      status: 409,
      message: "le clip brut d'origine n'est plus dans Traités : seuls le titre et la phrase se modifient",
    });
    expect(trims).toEqual([]);
    expect(state.replaced).toEqual([]);
  });

  it("refuse une fin au-delà de la durée du clip brut, un début négatif ou un titre vide, sans recoder", async () => {
    const { library, trims } = setup();
    expect(await library.revise({ ...moved, end: 300 })).toEqual({
      ok: false,
      status: 400,
      message: "la fin (300 s) dépasse la durée du clip (118.55 s)",
    });
    expect((await library.revise({ ...moved, start: -1 })).ok).toBe(false);
    expect((await library.revise({ ...moved, title: "" })).ok).toBe(false);
    expect(trims).toEqual([]);
  });

  it("rend 502 quand ffprobe ne lit pas la durée du clip brut", async () => {
    const { library, trims } = setup({ duration: undefined });
    expect(await library.revise(moved)).toEqual({
      ok: false,
      status: 502,
      message: "la durée du clip brut est illisible (ffprobe)",
    });
    expect(trims).toEqual([]);
  });

  it("laisse la vidéo confirmée telle quelle quand ffmpeg échoue : le fichier partiel part, rien n'est remplacé", async () => {
    const { library, state } = setup({
      encoded: { ok: false, message: "ffmpeg a échoué (code 1) : disque plein" },
    });
    expect(await library.revise(moved)).toEqual({
      ok: false,
      status: 502,
      message: "ffmpeg a échoué (code 1) : disque plein",
    });
    expect(state.calls).toEqual(["plan Replay.mp4 depuis Replay (2).mp4", "encode", "cancel"]);
    expect(state.replaced).toEqual([]);
  });

  it("retire le fichier partiel et le dit quand le remplacement échoue", async () => {
    const { library, state, logs } = setup();
    state.commitError = new Error("EPERM");
    expect(await library.revise(moved)).toEqual({
      ok: false,
      status: 502,
      message: "le clip n'a pas pu être rangé : EPERM",
    });
    expect(state.calls).toEqual(["plan Replay.mp4 depuis Replay (2).mp4", "encode", "remplace", "cancel"]);
    expect(logs.join("\n")).toContain("remplacement impossible");
  });

  it("rend 404 pour un clip confirmé qui n'existe pas, 400 pour un nom qui n'est pas un clip", async () => {
    const { library } = setup();
    expect(await library.revise({ ...request, name: "Absent.mp4" })).toEqual({
      ok: false,
      status: 404,
      message: "clip introuvable",
    });
    expect(await library.revise({ ...request, name: "../Replay.mp4" })).toEqual({
      ok: false,
      status: 400,
      message: "ce n'est pas un nom de clip",
    });
  });

  it("refuse en 409 un clip modifié pendant un recodage en cours, comme à la validation", async () => {
    const { library, release } = setup({ isHeld: true });
    const first = library.revise(moved);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const busy = { ok: false, status: 409, message: "un clip est déjà en cours de traitement" };
    expect(await library.revise({ ...request, title: "Autre" })).toEqual(busy);
    expect(await library.withdraw("Replay.mp4")).toEqual(busy);
    expect(await library.discard("autre.mp4")).toEqual(busy);
    release.current();
    expect((await first).ok).toBe(true);
    expect((await library.revise(request)).ok).toBe(true);
  });
});

describe("retirer un clip de l'émission", () => {
  it("range la vidéo, son JSON et son chat dans Traités et rend le nom qu'ils y prennent", async () => {
    const { library, state } = setup();
    expect(await library.withdraw("Replay.mp4")).toEqual({ ok: true, value: { name: "Replay (2).mp4" } });
    expect(state.calls).toEqual(["retire Replay.mp4"]);
  });

  it("rend 404 pour un clip confirmé qui n'existe pas, 400 pour un nom qui n'est pas un clip", async () => {
    const { library, state } = setup();
    expect(await library.withdraw("Absent.mp4")).toEqual({
      ok: false,
      status: 404,
      message: "clip introuvable",
    });
    expect(await library.withdraw("a/b.mp4")).toEqual({
      ok: false,
      status: 400,
      message: "ce n'est pas un nom de clip",
    });
    expect(state.calls).toEqual([]);
  });

  it("rend 502 avec la cause quand un déplacement échoue", async () => {
    const { library, state } = setup();
    state.withdrawError = new Error("EBUSY");
    expect(await library.withdraw("Replay.mp4")).toEqual({
      ok: false,
      status: 502,
      message: "le clip n'a pas pu être rangé : EBUSY",
    });
  });
});

describe("la liste des clips de l'émission", () => {
  it("rend les clips confirmés avec leur version et leur clip brut, du plus récemment validé au plus ancien", async () => {
    const older = { ...clip, name: "Ancien.mp4", title: "Ancien", confirmedAt: "2026-10-15T08:00:00.000Z" };
    const newer = {
      ...clip,
      name: "Récent.mp4",
      title: "Récent",
      confirmedAt: "2026-10-17T08:00:00.000Z",
      processedName: null,
    };
    const { library } = setup({ confirmed: [older, clip, newer] });
    const listed = await library.list();
    expect(listed.ok && listed.value.confirmed.map(({ title }) => title)).toEqual([
      "Récent",
      "Le saut",
      "Ancien",
    ]);
    expect(listed.ok && listed.value.confirmedCount).toBe(3);
    expect(listed.ok && listed.value.confirmed[0]).toMatchObject({ version: "1-100", processedName: null });
  });
});

describe("compter les passages d'un clip confirmé", () => {
  it("monte le nombre de passages de un dans le JSON, le reste tel quel", () => {
    const { library, state } = setup({ confirmed: [{ ...clip, playCount: 2 }] });
    library.notePlayed("Replay.mp4");
    expect(state.updated).toEqual([
      {
        name: "Replay.mp4",
        confirmation: {
          title: "Le saut",
          phrase: "Quel saut !",
          start: 12.5,
          end: 40,
          rawName: "Replay.mp4",
          processedName: "Replay (2).mp4",
          confirmedAt: "2026-10-16T10:00:00.000Z",
          playCount: 3,
        },
      },
    ]);
  });

  it("part de zéro pour un clip d'avant le compte", () => {
    const { library, state } = setup();
    library.notePlayed("Replay.mp4");
    expect(state.updated[0]?.confirmation.playCount).toBe(1);
  });

  it("ne fait rien pour un clip qui n'existe plus", () => {
    const { library, state } = setup();
    library.notePlayed("Absent.mp4");
    expect(state.updated).toEqual([]);
  });

  it("garde le nombre de passages quand on modifie le titre et la phrase", async () => {
    const { library, state } = setup({ confirmed: [{ ...clip, playCount: 4 }] });
    await library.revise(request);
    expect(state.updated[0]?.confirmation.playCount).toBe(4);
  });

  it("garde un passage compté pendant un recodage dans le JSON réécrit", async () => {
    const { library, state, release } = setup({ isHeld: true });
    const revising = library.revise({ ...request, start: 20, end: 50 });
    await new Promise((resolve) => setTimeout(resolve, 5));
    state.confirmed = [{ ...clip, playCount: 2 }];
    release.current();
    expect((await revising).ok).toBe(true);
    expect(state.replaced[0]?.confirmation.playCount).toBe(2);
  });

  it("dit au journal une panne du disque, sans la lever", () => {
    const { library, state, logs } = setup();
    state.updateError = new Error("disque plein");
    expect(() => library.notePlayed("Replay.mp4")).not.toThrow();
    expect(logs.at(-1)).toBe("Clips : « Replay.mp4 » : passage non compté, disque plein");
  });
});
