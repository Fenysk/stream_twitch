import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../domain/chat.schema";
import type { ClipChat, ClipConfirmation } from "../domain/clip.schema";
import type { ClipSettings, ConfirmedClip } from "./clip.usecase";
import { createClipAnalysis } from "./clip-analysis.usecase";

const FOLDER = "C:\\clips";
const SAVED_AT = 1_000_000;

const confirmed = (overrides: Partial<ConfirmedClip> = {}): ConfirmedClip => ({
  title: "Le saut",
  phrase: "Quel saut !",
  start: 20,
  end: 50,
  rawName: "Replay.mp4",
  confirmedAt: "2026-10-16T10:00:00.000Z",
  name: "Replay.mp4",
  version: "1-100",
  processedName: "Replay (2).mp4",
  rawDuration: 120,
  ...overrides,
});

const message = (id: string, secondsIntoRaw: number): ChatMessage => ({
  id,
  nickname: "Viewer",
  color: null,
  fragments: [{ kind: "text", text: id }],
  isHidden: false,
  receivedAt: SAVED_AT - 120_000 + secondsIntoRaw * 1000,
});

const STARTLE: ClipSettings = {
  foxStartleRise: 20,
  foxStartleWithin: 300,
  foxStartleLevel: -15,
  foxStartleGap: 30_000,
};

// Un faux disque (les clips confirmés, leur tchat, les chemins des vidéos), un faux ffprobe et un faux ffmpeg qui notent leurs demandes.
const setup = (
  options: {
    confirmed?: ConfirmedClip[];
    chat?: ClipChat;
    levels?: number[] | undefined;
    rawDuration?: number | undefined;
    settings?: ClipSettings;
    storeError?: Error;
  } = {},
) => {
  const state = {
    confirmed: options.confirmed ?? [confirmed()],
    written: [] as ClipConfirmation[],
    measured: [] as string[],
    probed: [] as string[],
    onMeasure: undefined as (() => void) | undefined,
  };
  const logs: string[] = [];
  const analysis = createClipAnalysis({
    store: {
      listConfirmed: () => {
        if (options.storeError) throw options.storeError;
        return state.confirmed;
      },
      pathOf: (_folder, kind, name) => `${FOLDER}\\${kind}\\${name}`,
      getChat: () => options.chat,
      updateConfirmation: (_folder, _name, confirmation) => {
        state.written.push(confirmation);
      },
    },
    probe: {
      probe: async (path) => {
        state.probed.push(path);
        return options.rawDuration;
      },
    },
    levels: {
      listLevels: async (path) => {
        state.measured.push(path);
        state.onMeasure?.();
        return "levels" in options ? options.levels : [-60, -60, -5, -60];
      },
    },
    log: (line) => logs.push(line),
  });
  analysis.update(options.settings ?? STARTLE);
  return { analysis, state, logs };
};

describe("mesurer le son d'un clip confirmé", () => {
  it("garde dans son JSON les instants où il fait sursauter Jean-Renard, le reste tel quel", async () => {
    const { analysis, state, logs } = setup();
    await analysis.refreshSpikes(FOLDER, "Replay.mp4");
    expect(state.measured).toEqual(["C:\\clips\\confirmed\\Replay.mp4"]);
    expect(state.written).toEqual([
      {
        title: "Le saut",
        phrase: "Quel saut !",
        start: 20,
        end: 50,
        rawName: "Replay.mp4",
        confirmedAt: "2026-10-16T10:00:00.000Z",
        processedName: "Replay (2).mp4",
        rawDuration: 120,
        spikes: [100],
      },
    ]);
    expect(logs).toEqual(["Clips : « Replay.mp4 » : 1 sursaut(s) dans le son."]);
  });

  it("ne garde rien sans les règles du sursaut, quand ffmpeg ne mesure pas ou quand le clip n'existe pas", async () => {
    const withoutRules = setup({ settings: {} });
    await withoutRules.analysis.refreshSpikes(FOLDER, "Replay.mp4");
    expect(withoutRules.state.measured).toEqual([]);
    const failing = setup({ levels: undefined });
    await failing.analysis.refreshSpikes(FOLDER, "Replay.mp4");
    expect(failing.state.written).toEqual([]);
    const missing = setup({ confirmed: [] });
    await missing.analysis.refreshSpikes(FOLDER, "Replay.mp4");
    expect(missing.state.measured).toEqual([]);
  });

  it("ne garde pas les spikes de l'ancienne vidéo quand elle est remplacée pendant la mesure", async () => {
    const { analysis, state } = setup();
    state.onMeasure = () => {
      state.confirmed = [confirmed({ version: "2-200" })];
    };
    await analysis.refreshSpikes(FOLDER, "Replay.mp4");
    expect(state.written).toEqual([]);
  });

  it("ne lève jamais : une panne du disque se dit au journal", async () => {
    const { analysis, logs } = setup({ storeError: new Error("disque illisible") });
    await expect(analysis.refreshSpikes(FOLDER, "Replay.mp4")).resolves.toBeUndefined();
    expect(logs).toEqual(["Clips : « Replay.mp4 » : son non mesuré, disque illisible"]);
  });
});

describe("ce que /show demande d'un clip", () => {
  it("rend les spikes déjà gardés sans mesurer le son, et la durée d'un sursaut", async () => {
    const { analysis, state } = setup({
      confirmed: [confirmed({ spikes: [1000, 5000] })],
      settings: { ...STARTLE, foxReactionDuration: 1500 },
    });
    expect(await analysis.getShowCues(FOLDER, "Replay.mp4")).toEqual({
      ok: true,
      value: { chat: [], spikes: [1000, 5000], startleMs: 1500 },
    });
    expect(state.measured).toEqual([]);
  });

  it("mesure le son d'un clip d'avant les spikes, une fois, et garde le résultat", async () => {
    const { analysis, state } = setup();
    const answer = await analysis.getShowCues(FOLDER, "Replay.mp4");
    expect(answer).toEqual({ ok: true, value: { chat: [], spikes: [100], startleMs: 1000 } });
    expect(state.written.at(-1)?.spikes).toEqual([100]);
  });

  it("ne lance pas deux mesures d'un même clip quand on le demande deux fois à la fois", async () => {
    const { analysis, state } = setup();
    await Promise.all([
      analysis.refreshSpikes(FOLDER, "Replay.mp4"),
      analysis.getShowCues(FOLDER, "Replay.mp4"),
    ]);
    expect(state.measured).toHaveLength(1);
  });

  it("rend une liste de spikes vide quand le son n'a pas pu être mesuré : le clip passe sans sursaut", async () => {
    const { analysis } = setup({ levels: undefined });
    expect(await analysis.getShowCues(FOLDER, "Replay.mp4")).toMatchObject({
      ok: true,
      value: { spikes: [] },
    });
  });

  it("refuse un clip inconnu, et une version qui n'est plus la sienne", async () => {
    const { analysis } = setup();
    expect(await analysis.getShowCues(FOLDER, "Absent.mp4")).toMatchObject({ ok: false, status: 404 });
    expect(await analysis.getShowCues(FOLDER, "Replay.mp4", "0-0")).toMatchObject({ ok: false, status: 404 });
    expect(await analysis.getShowCues(FOLDER, "Replay.mp4", "1-100")).toMatchObject({ ok: true });
  });

  it("rend 502 avec la cause quand le disque est illisible", async () => {
    const { analysis } = setup({ storeError: new Error("disque illisible") });
    expect(await analysis.getShowCues(FOLDER, "Replay.mp4")).toMatchObject({ ok: false, status: 502 });
  });
});

describe("le tchat placé sur le clip", () => {
  const chat: ClipChat = { savedAt: SAVED_AT, messages: [message("avant", 10), message("dedans", 35)] };

  it("place les messages de la partie gardée, avancés de 4 s par défaut", async () => {
    const { analysis } = setup({ chat, confirmed: [confirmed({ spikes: [] })] });
    const answer = await analysis.getShowCues(FOLDER, "Replay.mp4");
    expect(answer.ok && answer.value.chat.map(({ at, message: kept }) => [kept.id, at])).toEqual([
      ["dedans", 11_000],
    ]);
  });

  it("applique l'avance réglée (showChatLead)", async () => {
    const { analysis } = setup({
      chat,
      confirmed: [confirmed({ spikes: [] })],
      settings: { ...STARTLE, showChatLead: 0 },
    });
    const answer = await analysis.getShowCues(FOLDER, "Replay.mp4");
    expect(answer.ok && answer.value.chat.map(({ at }) => at)).toEqual([15_000]);
  });

  it("ne donne aucun tchat à un clip qui n'en a pas gardé, sans erreur", async () => {
    const { analysis } = setup({ confirmed: [confirmed({ spikes: [] })] });
    expect(await analysis.getShowCues(FOLDER, "Replay.mp4")).toMatchObject({ ok: true, value: { chat: [] } });
  });

  it("lit la durée du clip brut de Traités quand le JSON ne la garde pas, et la garde", async () => {
    const { analysis, state } = setup({
      chat,
      rawDuration: 120,
      confirmed: [confirmed({ spikes: [] })],
    });
    const { rawDuration: _removed, ...withoutDuration } = confirmed({ spikes: [] });
    state.confirmed = [withoutDuration];
    const answer = await analysis.getShowCues(FOLDER, "Replay.mp4");
    expect(state.probed).toEqual(["C:\\clips\\processed\\Replay (2).mp4"]);
    expect(answer.ok && answer.value.chat).toHaveLength(1);
    expect(state.written.at(-1)?.rawDuration).toBe(120);
  });

  it("ne place rien quand la durée du clip brut est inconnue et qu'il n'est plus dans Traités", async () => {
    const { analysis, state } = setup({ chat, rawDuration: undefined });
    const { rawDuration: _removed, ...withoutDuration } = confirmed({ spikes: [] });
    state.confirmed = [{ ...withoutDuration, processedName: null }];
    expect(await analysis.getShowCues(FOLDER, "Replay.mp4")).toMatchObject({ ok: true, value: { chat: [] } });
    expect(state.probed).toEqual([]);
  });
});
