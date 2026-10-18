import { describe, expect, it } from "vitest";
import { ADDRESS_MODE } from "../domain/fox-mode.rules";
import type { Settings } from "../domain/settings.schema";
import type { ShowState } from "../domain/show.schema";
import type { ClipFailure, ConfirmedClip, ConfirmedListResult } from "./clip.usecase";
import type { QueueItem } from "./fox-queue.usecase";
import type { ShowSpeakResult } from "./show.usecase";
import { createShowDirector, PAGE_GRACE_MS } from "./show-director.usecase";

const settings: Settings = {
  obsAddress: "ws://127.0.0.1:4455",
  micName: "Mic/Aux",
  threshold: -40,
  delay: 250,
};

const confirmed = (name: string, playCount?: number): ConfirmedClip => ({
  title: `Titre de ${name}`,
  phrase: `Phrase de ${name}`,
  start: 0,
  end: 10,
  rawName: name,
  confirmedAt: "2026-10-16T10:00:00.000Z",
  name,
  version: "1-100",
  processedName: null,
  ...(playCount === undefined ? {} : { playCount }),
});

// L'heure du faux serveur au départ (ms) : `startsAt` s'y ajoute le temps de la sortie de Jean-Renard.
const START = 100_000;

// Un faux OBS (la source /show devient visible ou non), un faux renard, une fausse présence et une fausse file qui notent leurs appels
// dans l'ordre, et des minuteurs à la main.
const setup = (
  options: {
    clips?: ConfirmedClip[];
    failure?: ClipFailure;
    custom?: Partial<Settings>;
    spoken?: ShowSpeakResult;
    // Les sounds de la soundboard, par identifiant.
    sounds?: Record<string, { version: string; fader: number }>;
    // Dans combien de ms Jean-Renard est hors de /fox quand il part (1500 par défaut).
    awayIn?: number;
  } = {},
) => {
  const calls: string[] = [];
  const said: string[] = [];
  const played: string[] = [];
  const logs: string[] = [];
  const released: (QueueItem | undefined)[] = [];
  const sceneListeners = new Set<(isVisible: boolean) => void>();
  const timers: { at: number; callback: () => void; isCancelled: boolean }[] = [];
  const state = { now: START, ids: 0, clips: options.clips ?? [confirmed("a.mp4"), confirmed("b.mp4")] };
  const director = createShowDirector({
    scene: {
      subscribe(listener) {
        sceneListeners.add(listener);
        return () => sceneListeners.delete(listener);
      },
    },
    clips: {
      listConfirmed: (): ConfirmedListResult =>
        options.failure ?? { ok: true, value: state.clips.map((clip) => ({ ...clip })) },
      notePlayed: (name) => played.push(name),
    },
    fox: { updateShow: (isOn) => calls.push(isOn ? "fox: émission" : "fox: retour") },
    queue: {
      hold: () => calls.push("file: tenue"),
      release: (first) => {
        released.push(first);
        calls.push(first ? `file: relâchée avec « ${first.text} »` : "file: relâchée");
      },
    },
    presence: {
      depart: () => {
        calls.push("présence: départ");
        return options.awayIn ?? 1500;
      },
      wake: () => {
        calls.push("présence: retour");
        return 0;
      },
    },
    clock: () => state.now,
    sounds: {
      get: (id) => {
        const sound = options.sounds?.[id];
        return sound && { id, ...sound };
      },
    },
    voice: {
      sayLine: async (kind) => {
        said.push(`ligne ${kind}`);
        return options.spoken ?? { ok: true, durationMs: 1234 };
      },
      sayText: async (text, label) => {
        said.push(`${label} : ${text}`);
        return options.spoken ?? { ok: true, durationMs: text === "" ? 0 : 1234 };
      },
    },
    settings: { ...settings, ...options.custom },
    random: () => 0.999,
    createId: () => {
      state.ids += 1;
      return `run${state.ids}`;
    },
    schedule: (callback, ms) => {
      const timer = { at: state.now + ms, callback, isCancelled: false };
      timers.push(timer);
      return () => {
        timer.isCancelled = true;
      };
    },
    log: (message) => logs.push(message),
  });
  director.start();
  const states: ShowState[] = [];
  director.subscribe((next) => states.push(next));
  return {
    director,
    calls,
    said,
    played,
    logs,
    released,
    states,
    send: (isVisible: boolean) => {
      for (const listener of sceneListeners) listener(isVisible);
    },
    advance: (ms: number) => {
      state.now += ms;
      for (const timer of timers.filter(({ at, isCancelled }) => at <= state.now && !isCancelled)) {
        timer.isCancelled = true;
        timer.callback();
      }
    },
    sceneListeners,
    state,
  };
};

describe("createShowDirector : le démarrage", () => {
  it("est arrêtée tant que la source /show n'est pas visible", () => {
    const { director, calls } = setup();
    expect(director.getState()).toMatchObject({ status: "idle", runId: "", lineup: [] });
    expect(calls).toEqual([]);
  });

  it("démarre quand la source devient visible : les clips en ordre, la file tenue avant que Jean-Renard quitte /fox", () => {
    const { director, calls, states, logs, send } = setup();
    send(true);
    expect(director.getState()).toEqual({
      status: "running",
      runId: "run1",
      lineup: [
        { name: "a.mp4", title: "Titre de a.mp4", version: "1-100", day: "2026-10-16", laughs: [] },
        { name: "b.mp4", title: "Titre de b.mp4", version: "1-100", day: "2026-10-16", laughs: [] },
      ],
      phase: "opening",
      index: 0,
      startsAt: START + 1500,
    });
    expect(calls).toEqual(["file: tenue", "présence: départ", "fox: émission"]);
    expect(states).toHaveLength(1);
    expect(logs).toEqual(["Émission : démarrée, 2 clip(s) : « a.mp4 », « b.mp4 »."]);
  });

  it("passe les moins passés d'abord, au plus le nombre de clips réglé", () => {
    const { director, send } = setup({
      clips: [confirmed("a.mp4", 3), confirmed("b.mp4", 0), confirmed("c.mp4", 1), confirmed("d.mp4", 0)],
      custom: { showClipCount: 3 },
    });
    send(true);
    expect(director.getState().lineup.map(({ name }) => name)).toEqual(["b.mp4", "d.mp4", "c.mp4"]);
  });

  it("donne à chaque clip le jour où il a été enregistré, lu dans le nom de son clip brut", () => {
    const { director, send } = setup({
      clips: [{ ...confirmed("a.mp4"), rawName: "Replay 2026-10-15 15-09-05.mp4" }],
    });
    send(true);
    expect(director.getState().lineup.map(({ day }) => day)).toEqual(["2026-10-15"]);
  });

  it("donne à chaque clip ses rires : le sound de la soundboard avec sa version et son fader, à son instant en ms, rien sans rires", () => {
    const { director, send } = setup({
      clips: [
        {
          ...confirmed("a.mp4"),
          laughs: [
            { at: 6, sound: "abcd1234" },
            { at: 2.5, sound: "efgh5678" },
          ],
        },
        confirmed("b.mp4"),
      ],
      sounds: { abcd1234: { version: "99.5", fader: 60 }, efgh5678: { version: "3.1", fader: 100 } },
    });
    send(true);
    expect(director.getState().lineup.map(({ laughs }) => laughs)).toEqual([
      [
        { id: "efgh5678", version: "3.1", fader: 100, at: 2500 },
        { id: "abcd1234", version: "99.5", fader: 60, at: 6000 },
      ],
      [],
    ]);
  });

  it("joue chaque rire au fader de son sound fois le volume des rires du clip : la soundboard reste la base entre les sounds", () => {
    const laughs = [
      { at: 2, sound: "abcd1234" },
      { at: 4, sound: "efgh5678" },
    ];
    const { director, send } = setup({
      clips: [
        { ...confirmed("a.mp4"), laughs, laughFader: 50 },
        { ...confirmed("b.mp4"), laughs },
        { ...confirmed("c.mp4"), laughs, laughFader: 0 },
      ],
      sounds: { abcd1234: { version: "1", fader: 80 }, efgh5678: { version: "1", fader: 60 } },
      custom: { showClipCount: 3 },
    });
    send(true);
    const faders = director
      .getState()
      .lineup.map(({ laughs: clipLaughs }) => clipLaughs.map(({ fader }) => fader));
    expect(faders.map((list) => list.length)).toEqual([2, 2, 2]);
    expect(faders).toContainEqual([40, 30]);
    expect(faders).toContainEqual([80, 60]);
    expect(faders).toContainEqual([0, 0]);
  });

  it("saute un rire dont le sound a été supprimé depuis, sans erreur, et garde les autres", () => {
    const { director, send } = setup({
      clips: [
        {
          ...confirmed("a.mp4"),
          laughs: [
            { at: 1, sound: "disparu1" },
            { at: 4, sound: "abcd1234" },
          ],
        },
        { ...confirmed("b.mp4"), laughs: [{ at: 1, sound: "disparu1" }] },
      ],
      sounds: { abcd1234: { version: "99.5", fader: 60 } },
    });
    send(true);
    expect(director.getState().lineup.map(({ laughs }) => laughs)).toEqual([
      [{ id: "abcd1234", version: "99.5", fader: 60, at: 4000 }],
      [],
    ]);
  });

  it("ne donne que les rires de la partie gardée, comptés depuis le début du clip confirmé : un rire à la fin part avec la vidéo", () => {
    const { director, send } = setup({
      clips: [
        {
          ...confirmed("a.mp4"),
          start: 2,
          end: 8,
          laughs: [
            { at: 1, sound: "abcd1234" },
            { at: 5, sound: "abcd1234" },
            { at: 8, sound: "abcd1234" },
            { at: 9, sound: "abcd1234" },
          ],
        },
      ],
      sounds: { abcd1234: { version: "99.5", fader: 60 } },
    });
    send(true);
    expect(director.getState().lineup[0]?.laughs.map(({ at }) => at)).toEqual([3000, 6000]);
  });

  it("passe cinq clips quand les réglages ne disent rien", () => {
    const clips = Array.from({ length: 8 }, (_, index) => confirmed(`clip${index}.mp4`));
    const { director, send } = setup({ clips });
    send(true);
    expect(director.getState().lineup).toHaveLength(5);
  });

  it("applique un nombre de clips réglé en cours de route, à la prochaine émission", () => {
    const clips = Array.from({ length: 8 }, (_, index) => confirmed(`clip${index}.mp4`));
    const { director, send } = setup({ clips });
    director.update({ ...settings, showClipCount: 2 });
    send(true);
    expect(director.getState().lineup).toHaveLength(2);
  });

  it("ne redémarre pas quand la source est déjà visible", () => {
    const { calls, states, send } = setup();
    send(true);
    send(true);
    expect(calls).toEqual(["file: tenue", "présence: départ", "fox: émission"]);
    expect(states).toHaveLength(1);
  });

  it("ne passe rien sans clip confirmé : l'émission est finie, Jean-Renard ne bouge pas", () => {
    const { director, calls, logs, send } = setup({ clips: [] });
    send(true);
    expect(director.getState().status).toBe("over");
    expect(calls).toEqual([]);
    expect(logs).toEqual(["Émission : aucun clip confirmé, rien à passer."]);
  });

  it("ne passe rien quand les clips sont illisibles, et le dit", () => {
    const { director, calls, logs, send } = setup({
      failure: { ok: false, status: 503, message: "le dossier des clips n'est pas réglé" },
    });
    send(true);
    expect(director.getState().status).toBe("over");
    expect(calls).toEqual([]);
    expect(logs).toEqual(["Émission : clips illisibles, le dossier des clips n'est pas réglé."]);
  });
});

describe("createShowDirector : l'arrêt par la scène", () => {
  it("s'arrête dès que la source n'est plus visible : Jean-Renard revient, la file reprend", () => {
    const { director, calls, logs, send } = setup();
    send(true);
    calls.length = 0;
    send(false);
    expect(director.getState()).toMatchObject({ status: "idle", runId: "", lineup: [] });
    expect(calls).toEqual(["fox: retour", "file: relâchée", "présence: retour"]);
    expect(logs.at(-1)).toBe("Émission : arrêtée, la source /show n'est plus visible.");
  });

  it("repart du début quand la source redevient visible", () => {
    const { director, send } = setup();
    send(true);
    send(false);
    send(true);
    expect(director.getState()).toMatchObject({
      status: "running",
      runId: "run2",
      phase: "opening",
      index: 0,
    });
  });

  it("ne fait rien d'une source cachée alors que l'émission est arrêtée", () => {
    const { calls, states, send } = setup();
    send(false);
    expect(calls).toEqual([]);
    expect(states).toEqual([]);
  });

  it("s'arrête avec le serveur : plus de scène écoutée, Jean-Renard revient", () => {
    const { director, calls, sceneListeners, send } = setup();
    send(true);
    calls.length = 0;
    director.stop();
    expect(director.getState().status).toBe("idle");
    expect(calls).toEqual(["fox: retour", "file: relâchée"]);
    expect(sceneListeners.size).toBe(0);
  });
});

describe("createShowDirector : Jean-Renard glisse hors de /fox avant que /show commence", () => {
  it("tient la file, le fait partir, puis le montre dans /show : l'ouverture commence à la fin de sa sortie", () => {
    const { director, calls, send } = setup({ awayIn: 1500 });
    send(true);
    expect(calls).toEqual(["file: tenue", "présence: départ", "fox: émission"]);
    expect(director.getState().startsAt).toBe(START + 1500);
  });

  it("compte le temps de sa sortie depuis l'heure du serveur : le reste d'une descente déjà commencée, ou rien", () => {
    const rested = setup({ awayIn: 600 });
    rested.advance(5000);
    rested.send(true);
    expect(rested.director.getState().startsAt).toBe(START + 5000 + 600);
    const away = setup({ awayIn: 0 });
    away.send(true);
    expect(away.director.getState().startsAt).toBe(START);
  });

  it("garde l'instant du début dans chaque état que la page rapporte", () => {
    const { director, send } = setup({ awayIn: 1500 });
    send(true);
    director.report({ runId: "run1", phase: "card", index: 1 });
    expect(director.getState()).toMatchObject({ phase: "card", startsAt: START + 1500 });
  });

  it("n'a plus d'instant de début une fois l'émission arrêtée ou finie", () => {
    const { director, send } = setup();
    send(true);
    director.report({ runId: "run1", phase: "ended", index: 0 });
    expect(director.getState().startsAt).toBe(0);
    send(false);
    expect(director.getState().startsAt).toBe(0);
  });

  it("ne le fait pas partir sans clip à passer : ni file tenue, ni départ, ni /show", () => {
    const { calls, send } = setup({ clips: [] });
    send(true);
    expect(calls).toEqual([]);
  });
});

describe("createShowDirector : l'émission coupée en cours", () => {
  const GRUMBLES = ["Phrase A", "Phrase B"];

  it("fait revenir Jean-Renard sur /fox, puis passer sa phrase dans la file, puis le fait sauter pour revenir", () => {
    const { calls, send } = setup({ custom: { showGrumblePhrases: GRUMBLES } });
    send(true);
    calls.length = 0;
    send(false);
    expect(calls).toEqual(["fox: retour", "file: relâchée avec « Phrase B »", "présence: retour"]);
  });

  it("donne à la file une phrase urgente, qu'on ne coupe pas, tournée vers Fenysk", () => {
    const { released, send } = setup({ custom: { showGrumblePhrases: GRUMBLES } });
    send(true);
    send(false);
    const [grumble] = released;
    expect(grumble).toMatchObject({
      kind: "grumble",
      label: "la phrase de l'émission coupée",
      text: "Phrase B",
      isCuttable: false,
      isUrgent: true,
    });
    expect(grumble?.toShow()).toEqual(ADDRESS_MODE);
  });

  it("l'écrit au journal avant de dire que l'émission est arrêtée", () => {
    const { logs, send } = setup({ custom: { showGrumblePhrases: GRUMBLES } });
    send(true);
    send(false);
    expect(logs.slice(-2)).toEqual([
      "Émission : coupée en cours, Jean-Renard revient et râle : « Phrase B ».",
      "Émission : arrêtée, la source /show n'est plus visible.",
    ]);
  });

  it("tire sans répéter avant d'avoir tout dit, d'une émission à l'autre", () => {
    const { released, send } = setup({ custom: { showGrumblePhrases: GRUMBLES } });
    for (let run = 0; run < 2; run += 1) {
      send(true);
      send(false);
    }
    expect(new Set(released.map((first) => first?.text))).toEqual(new Set(GRUMBLES));
  });

  it("recommence un tour sans redire la dernière phrase dite", () => {
    const { released, send } = setup({ custom: { showGrumblePhrases: GRUMBLES } });
    for (let run = 0; run < 3; run += 1) {
      send(true);
      send(false);
    }
    expect(released.map((first) => first?.text)).toEqual(["Phrase B", "Phrase A", "Phrase B"]);
  });

  it("relit la liste quand les réglages changent", () => {
    const { director, released, send } = setup({ custom: { showGrumblePhrases: GRUMBLES } });
    director.update({ ...settings, showGrumblePhrases: ["Nouvelle"] });
    send(true);
    send(false);
    expect(released.map((first) => first?.text)).toEqual(["Nouvelle"]);
  });

  it("revient quand même, sans phrase, quand la liste est vide", () => {
    const { calls, released, logs, send } = setup({ custom: { showGrumblePhrases: [] } });
    send(true);
    calls.length = 0;
    send(false);
    expect(calls).toEqual(["fox: retour", "file: relâchée", "présence: retour"]);
    expect(released).toEqual([undefined]);
    expect(logs.some((line) => line.includes("râle"))).toBe(false);
  });

  it("revient quand même, sans phrase, quand la liste n'est pas réglée", () => {
    const { calls, released, send } = setup();
    send(true);
    calls.length = 0;
    send(false);
    expect(calls).toEqual(["fox: retour", "file: relâchée", "présence: retour"]);
    expect(released).toEqual([undefined]);
  });

  it("ne râle pas à la fin normale : il revient en sautant, sans phrase", () => {
    const { director, calls, released, send } = setup({ custom: { showGrumblePhrases: GRUMBLES } });
    send(true);
    calls.length = 0;
    director.report({ runId: "run1", phase: "ended", index: 0 });
    expect(calls).toEqual(["fox: retour", "file: relâchée", "présence: retour"]);
    expect(released).toEqual([undefined]);
  });

  it("ne râle pas non plus après 20 s sans page /show : il revient en sautant, sans phrase", () => {
    const { calls, released, send, advance } = setup({ custom: { showGrumblePhrases: GRUMBLES } });
    send(true);
    calls.length = 0;
    advance(PAGE_GRACE_MS);
    expect(calls).toEqual(["fox: retour", "file: relâchée", "présence: retour"]);
    expect(released).toEqual([undefined]);
  });

  it("ne râle pas ni ne le réveille à l'arrêt du serveur", () => {
    const { director, calls, released, send } = setup({ custom: { showGrumblePhrases: GRUMBLES } });
    send(true);
    calls.length = 0;
    director.stop();
    expect(calls).toEqual(["fox: retour", "file: relâchée"]);
    expect(released).toEqual([undefined]);
  });

  it("ne fait rien d'une source cachée une fois l'émission finie", () => {
    const { director, calls, released, send } = setup({ custom: { showGrumblePhrases: GRUMBLES } });
    send(true);
    director.report({ runId: "run1", phase: "ended", index: 0 });
    calls.length = 0;
    released.length = 0;
    send(false);
    expect(director.getState().status).toBe("idle");
    expect(calls).toEqual([]);
    expect(released).toEqual([]);
  });

  it("ne fait rien d'une source cachée alors que l'émission est arrêtée", () => {
    const { calls, released, send } = setup({ custom: { showGrumblePhrases: GRUMBLES } });
    send(false);
    expect(calls).toEqual([]);
    expect(released).toEqual([]);
  });

  it("ne râle pas sans clip à passer : la source cachée ne change rien", () => {
    const { calls, released, send } = setup({ clips: [], custom: { showGrumblePhrases: GRUMBLES } });
    send(true);
    send(false);
    expect(calls).toEqual([]);
    expect(released).toEqual([]);
  });
});

describe("createShowDirector : le déroulé dit par la page", () => {
  it("suit la phase et le clip que la page rapporte", () => {
    const { director, states, send } = setup();
    send(true);
    expect(director.report({ runId: "run1", phase: "card", index: 1 })).toEqual({ ok: true });
    expect(director.getState()).toMatchObject({ status: "running", phase: "card", index: 1 });
    expect(director.report({ runId: "run1", phase: "closing", index: 0 })).toEqual({ ok: true });
    expect(director.getState()).toMatchObject({ phase: "closing", index: 0 });
    expect(states.map(({ phase }) => phase)).toEqual(["opening", "card", "closing"]);
  });

  it("compte un passage au début du clip, une seule fois même si la page le redit", () => {
    const { director, played, logs, send } = setup();
    send(true);
    director.report({ runId: "run1", phase: "card", index: 0 });
    expect(played).toEqual([]);
    director.report({ runId: "run1", phase: "clip", index: 0 });
    director.report({ runId: "run1", phase: "clip", index: 0 });
    director.report({ runId: "run1", phase: "clip", index: 1 });
    expect(played).toEqual(["a.mp4", "b.mp4"]);
    expect(logs).toContain("Émission : clip 2 sur 2, « Titre de b.mp4 ».");
  });

  it("refuse un clip qui n'est pas dans l'émission", () => {
    const { director, send } = setup();
    send(true);
    expect(director.report({ runId: "run1", phase: "clip", index: 2 })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(director.getState().phase).toBe("opening");
  });

  it("finit quand la page le dit : Jean-Renard revient, la source visible ne relance rien", () => {
    const { director, calls, send } = setup();
    send(true);
    calls.length = 0;
    expect(director.report({ runId: "run1", phase: "ended", index: 0 })).toEqual({ ok: true });
    expect(director.getState()).toMatchObject({ status: "over", runId: "", lineup: [] });
    expect(calls).toEqual(["fox: retour", "file: relâchée", "présence: retour"]);
    send(true);
    expect(director.getState().status).toBe("over");
    expect(calls).toHaveLength(3);
  });

  it("repart après avoir été cachée : la source finie qui disparaît puis revient relance une émission", () => {
    const { director, send } = setup();
    send(true);
    director.report({ runId: "run1", phase: "ended", index: 0 });
    send(false);
    expect(director.getState().status).toBe("idle");
    send(true);
    expect(director.getState().status).toBe("running");
  });

  it("refuse le rapport d'une autre émission, ou d'une émission qui n'est plus en cours", () => {
    const { director, send, played } = setup();
    expect(director.report({ runId: "run1", phase: "clip", index: 0 })).toMatchObject({
      ok: false,
      status: 409,
    });
    send(true);
    expect(director.report({ runId: "ancienne", phase: "clip", index: 0 })).toMatchObject({
      ok: false,
      status: 409,
    });
    send(false);
    expect(director.report({ runId: "run1", phase: "clip", index: 0 })).toMatchObject({
      ok: false,
      status: 409,
    });
    expect(played).toEqual([]);
  });
});

describe("createShowDirector : la page /show absente", () => {
  it("s'arrête quand aucune page /show ne se connecte dans les 20 s", () => {
    const { director, calls, logs, send, advance } = setup();
    send(true);
    advance(PAGE_GRACE_MS - 1);
    expect(director.getState().status).toBe("running");
    advance(1);
    expect(director.getState().status).toBe("over");
    expect(calls).toEqual([
      "file: tenue",
      "présence: départ",
      "fox: émission",
      "fox: retour",
      "file: relâchée",
      "présence: retour",
    ]);
    expect(logs.at(-1)).toBe("Émission : arrêtée, aucune page /show connectée depuis 20 s.");
  });

  it("continue tant qu'une page est connectée", () => {
    const { director, send, advance } = setup();
    const close = director.openPage();
    send(true);
    advance(PAGE_GRACE_MS * 5);
    expect(director.getState().status).toBe("running");
    close();
  });

  it("s'arrête 20 s après la déconnexion de la dernière page", () => {
    const { director, send, advance } = setup();
    const first = director.openPage();
    const second = director.openPage();
    send(true);
    first();
    advance(PAGE_GRACE_MS * 2);
    expect(director.getState().status).toBe("running");
    second();
    second();
    advance(PAGE_GRACE_MS);
    expect(director.getState().status).toBe("over");
  });

  it("annule l'attente quand une page revient à temps (la page rechargée)", () => {
    const { director, send, advance } = setup();
    send(true);
    advance(PAGE_GRACE_MS - 1000);
    director.openPage();
    advance(PAGE_GRACE_MS * 3);
    expect(director.getState().status).toBe("running");
  });
});

describe("createShowDirector : ce que Jean-Renard dit dans l'émission", () => {
  it("fait dire l'ouverture et la clôture, et rend la durée de la voix", async () => {
    const { director, said, send } = setup();
    send(true);
    expect(await director.speak({ runId: "run1", kind: "opening" })).toEqual({ ok: true, durationMs: 1234 });
    expect(await director.speak({ runId: "run1", kind: "closing" })).toEqual({ ok: true, durationMs: 1234 });
    expect(said).toEqual(["ligne opening", "ligne closing"]);
  });

  it("fait dire la phrase fixe des rires, venue du serveur", async () => {
    const { director, said, send } = setup();
    send(true);
    expect(await director.speak({ runId: "run1", kind: "laugh" })).toEqual({ ok: true, durationMs: 1234 });
    expect(said).toEqual(["la phrase des rires : Les rires sont enregistrés. Personne n'a ri."]);
  });

  it("fait dire la phrase du JSON du clip demandé, lue sur le serveur, avec son titre pour le journal", async () => {
    const { director, said, send } = setup();
    send(true);
    expect(await director.speak({ runId: "run1", kind: "clip", index: 1 })).toEqual({
      ok: true,
      durationMs: 1234,
    });
    expect(said).toEqual(["la phrase de « Titre de b.mp4 » : Phrase de b.mp4"]);
  });

  it("ne dit rien d'un clip sans phrase : durée 0", async () => {
    const { director, send } = setup({ clips: [{ ...confirmed("a.mp4"), phrase: "" }] });
    send(true);
    expect(await director.speak({ runId: "run1", kind: "clip", index: 0 })).toEqual({
      ok: true,
      durationMs: 0,
    });
  });

  it("refuse un clip qui n'est pas dans l'émission", async () => {
    const { director, said, send } = setup();
    send(true);
    expect(await director.speak({ runId: "run1", kind: "clip", index: 5 })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(said).toEqual([]);
  });

  it("refuse la phrase d'une autre émission, ou d'une émission arrêtée, sans rien dire", async () => {
    const { director, said, send } = setup();
    expect(await director.speak({ runId: "run1", kind: "opening" })).toMatchObject({
      ok: false,
      status: 409,
    });
    send(true);
    expect(await director.speak({ runId: "ancienne", kind: "opening" })).toMatchObject({
      ok: false,
      status: 409,
    });
    send(false);
    expect(await director.speak({ runId: "run1", kind: "opening" })).toMatchObject({
      ok: false,
      status: 409,
    });
    expect(said).toEqual([]);
  });

  it("rend le refus de la voix tel quel", async () => {
    const refusal: ShowSpeakResult = { ok: false, status: 502, message: "la synthèse a échoué" };
    const { director, send } = setup({ spoken: refusal });
    send(true);
    expect(await director.speak({ runId: "run1", kind: "opening" })).toEqual(refusal);
  });
});
