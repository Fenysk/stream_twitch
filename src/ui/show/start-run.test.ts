import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FoxMode } from "../../domain/fox.schema";
import type { ShowLaugh, ShowState } from "../../domain/show.schema";
import { getShowCues, reportShowProgress, speakInShow } from "../show-api";
import { createLaughFiles, type LaughFiles } from "./show-laugh";
import { playVideo, prepareVideo } from "./show-video";
import type { ShowView } from "./show-view";
import { startRun } from "./start-run";

vi.mock("../show-api", () => ({
  speakInShow: vi.fn(async () => ({ ok: true, value: 1000 })),
  reportShowProgress: vi.fn(async () => ({ ok: true, value: null })),
  getShowCues: vi.fn(async () => ({ ok: false, message: "pas de données" })),
  toShowVideoUrl: () => "/video",
}));

vi.mock("./show-video", () => ({ prepareVideo: vi.fn(), playVideo: vi.fn() }));
vi.mock("./show-laugh", () => ({ createLaughFiles: vi.fn() }));

// Les fichiers de rire de la page : le téléchargement et la lecture sont notés, la lecture se règle par test. `aborted` : la promesse que
// l'émission donne pour couper les rires.
const laughFiles = {
  prepare: vi.fn<LaughFiles["prepare"]>(),
  play: vi.fn<LaughFiles["play"]>(),
  setFader: vi.fn<LaughFiles["setFader"]>(),
  clear: vi.fn<LaughFiles["clear"]>(),
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  vi.mocked(speakInShow).mockResolvedValue({ ok: true, value: 1000 });
  vi.mocked(reportShowProgress).mockResolvedValue({ ok: true, value: null });
  vi.mocked(getShowCues).mockResolvedValue({ ok: false, message: "pas de données" });
  laughFiles.prepare.mockResolvedValue(undefined);
  laughFiles.play.mockResolvedValue(true);
  vi.mocked(createLaughFiles).mockReturnValue(laughFiles);
});

afterEach(() => {
  vi.useRealTimers();
});

const state: ShowState = {
  status: "running",
  runId: "run1",
  lineup: [{ name: "a.mp4", title: "A", version: "1-1", day: "2026-10-16", durationMs: 10_000, laughs: [] }],
  phase: "opening",
  index: 0,
  startsAt: 0,
  returnAt: 0,
  showFader: 100,
};

// Une page sans vidéo : le clip ne se charge pas et est passé, le reste du déroulé a lieu.
const setup = (shown: ShowState = state) => {
  const views: ShowView[] = [];
  const modes: FoxMode[] = [];
  const foxFaders: number[] = [];
  const run = startRun(shown, {
    videoOf: () => null,
    setView: (view) => views.push(view),
    addChat: () => undefined,
    clearChat: () => undefined,
    setFoxMode: (mode) => modes.push(mode),
    setFoxFader: (fader) => foxFaders.push(fader),
  });
  return { run, views, modes, foxFaders };
};

const reported = () => vi.mocked(reportShowProgress).mock.calls.map(([progress]) => progress);

describe("startRun", () => {
  it("annonce l'ouverture avec le numéro de l'émission et fait dire la phrase au serveur", async () => {
    setup();
    await vi.advanceTimersByTimeAsync(0);
    expect(reported()).toEqual([{ runId: "run1", phase: "opening", index: 0 }]);
    expect(vi.mocked(speakInShow).mock.calls).toEqual([[{ runId: "run1", kind: "opening" }]]);
  });

  it("déroule l'ouverture, saute le clip qui ne se lit pas, fait la clôture, puis annonce la fin", async () => {
    const { views } = setup();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(reported().map(({ phase }) => phase)).toEqual(["opening", "closing", "ended"]);
    expect(views.map(({ kind }) => kind)).toEqual(["opening", "closing", "none"]);
  });

  it("s'arrête tout de suite : les minuteurs sont réveillés, plus aucune vue ni rapport, la fin n'est pas annoncée", async () => {
    const { run, views } = setup();
    await vi.advanceTimersByTimeAsync(500);
    run.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(views.map(({ kind }) => kind)).toEqual(["opening"]);
    expect(reported().map(({ phase }) => phase)).toEqual(["opening"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("dit au serveur chaque temps avec le numéro de l'émission, de quoi estimer le retour de Fenysk, et plus rien une fois arrêtée", async () => {
    const { run } = setup();
    await vi.advanceTimersByTimeAsync(0);
    expect(reported()).toEqual([{ runId: "run1", phase: "opening", index: 0 }]);
    // Le clip ne se lit pas : l'ouverture finie (2,5 s), la clôture suit.
    await vi.advanceTimersByTimeAsync(2500);
    expect(reported()).toEqual([
      { runId: "run1", phase: "opening", index: 0 },
      { runId: "run1", phase: "closing", index: 0 },
    ]);
    run.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reported()).toHaveLength(2);
  });

  it("calme Jean-Renard quand l'émission s'arrête", () => {
    const { run, modes } = setup();
    run.stop();
    expect(modes).toEqual([{ kind: "idle" }]);
  });

  it("garde le numéro de l'émission, de quoi savoir si une autre a pris sa place", () => {
    expect(setup().run.runId).toBe("run1");
  });
});

describe("startRun : l'attente de la sortie de Jean-Renard", () => {
  const startingIn = (ms: number): ShowState => ({ ...state, startsAt: Date.now() + ms });

  it("n'ouvre l'émission qu'à l'instant de début : ni rapport ni phrase avant, la page reste transparente", async () => {
    const { views, modes } = setup(startingIn(1500));
    await vi.advanceTimersByTimeAsync(1499);
    expect(reported()).toEqual([]);
    expect(vi.mocked(speakInShow)).not.toHaveBeenCalled();
    expect(views).toEqual([]);
    expect(modes).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(reported()).toEqual([{ runId: "run1", phase: "opening", index: 0 }]);
    expect(vi.mocked(speakInShow).mock.calls).toEqual([[{ runId: "run1", kind: "opening" }]]);
    expect(views.map(({ kind }) => kind)).toEqual(["opening"]);
  });

  it("déroule ensuite l'émission en entier, comme sans attente", async () => {
    const { views } = setup(startingIn(1500));
    await vi.advanceTimersByTimeAsync(21_500);
    expect(reported().map(({ phase }) => phase)).toEqual(["opening", "closing", "ended"]);
    expect(views.map(({ kind }) => kind)).toEqual(["opening", "closing", "none"]);
  });

  it("ne part jamais quand l'émission s'arrête pendant l'attente : plus de minuteur, ni rapport ni phrase", async () => {
    const { run, views } = setup(startingIn(1500));
    await vi.advanceTimersByTimeAsync(500);
    run.stop();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reported()).toEqual([]);
    expect(vi.mocked(speakInShow)).not.toHaveBeenCalled();
    expect(views).toEqual([]);
  });

  it("commence tout de suite quand l'instant est passé : la page rechargée en pleine émission", async () => {
    setup(startingIn(-5000));
    await vi.advanceTimersByTimeAsync(0);
    expect(reported()).toEqual([{ runId: "run1", phase: "opening", index: 0 }]);
  });

  it("commence tout de suite à l'instant même", async () => {
    setup(startingIn(0));
    await vi.advanceTimersByTimeAsync(0);
    expect(reported()).toEqual([{ runId: "run1", phase: "opening", index: 0 }]);
  });
});

describe("startRun : un clip qui joue", () => {
  const CUES = {
    chat: [
      {
        at: 1000,
        message: {
          id: "m1",
          nickname: "Viewer",
          color: null,
          fragments: [{ kind: "text" as const, text: "salut" }],
          isHidden: false,
          receivedAt: 0,
        },
      },
    ],
    spikes: [2000],
    startleMs: 1000,
  };
  const FIRST: ShowLaugh = { id: "rires001", version: "1", fader: 80, at: 1000 };
  const SECOND: ShowLaugh = { id: "rires002", version: "2", fader: 60, at: 3000 };
  const laughing: ShowState = {
    ...state,
    lineup: [
      {
        name: "a.mp4",
        title: "A",
        version: "1-1",
        day: "2026-10-16",
        durationMs: 10_000,
        laughs: [FIRST, SECOND],
      },
    ],
  };

  // Une page avec une vidéo qui se lit : ce que le clip joue se règle par `play`, qui reçoit le pas du clip.
  const setupWithVideo = (play: (onTime: (ms: number) => void) => Promise<void>) => {
    vi.mocked(prepareVideo).mockResolvedValue(true);
    vi.mocked(playVideo).mockImplementation(async (_video, _aborted, onTime) => play(onTime));
    vi.mocked(getShowCues).mockResolvedValue({ ok: true, value: CUES });
    const video = { pause: () => undefined } as HTMLVideoElement;
    const events: string[] = [];
    const run = startRun(laughing, {
      videoOf: () => video,
      setView: (view) => events.push(`vue ${view.kind}`),
      addChat: (messages) => {
        if (messages.length > 0) events.push(`tchat ${messages.map(({ id }) => id).join(",")}`);
      },
      clearChat: () => events.push("tchat effacé"),
      setFoxMode: (mode) => events.push(`renard ${mode.kind}`),
      setFoxFader: () => undefined,
    });
    return { run, events };
  };

  it("fait paraître le tchat et sursauter Jean-Renard au rythme du clip, puis calme Jean-Renard", async () => {
    const { events } = setupWithVideo(async (onTime) => {
      onTime(500);
      onTime(1500);
      onTime(2500);
    });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(events.filter((event) => event.startsWith("tchat m") || event.startsWith("renard"))).toEqual([
      "tchat m1",
      "renard startle",
      "renard idle",
    ]);
  });

  it("efface le tchat une fois le fondu du carton fini, pas avant, et encore au début du clip", async () => {
    const { events } = setupWithVideo(async () => undefined);
    await vi.advanceTimersByTimeAsync(2500);
    expect(events).toContain("vue card");
    expect(events).not.toContain("tchat effacé");
    await vi.advanceTimersByTimeAsync(1000);
    expect(events).toContain("tchat effacé");
  });

  const spokenKinds = () => vi.mocked(speakInShow).mock.calls.map(([request]) => request.kind);

  it("télécharge les fichiers de rire du clip pendant que sa vidéo se charge, avant qu'il joue", async () => {
    const { events } = setupWithVideo(async () => undefined);
    laughFiles.prepare.mockImplementation(async () => void events.push("rires téléchargés"));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(laughFiles.prepare.mock.calls).toEqual([[[FIRST, SECOND]]]);
    expect(events.indexOf("rires téléchargés")).toBeLessThan(events.indexOf("vue clip"));
  });

  it("fait partir chaque rire à son instant au rythme du clip, puis les autres à la fin de la vidéo", async () => {
    const { events } = setupWithVideo(async (onTime) => {
      onTime(500);
      onTime(1500);
      events.push("vidéo finie");
    });
    laughFiles.play.mockImplementation(async ({ at }) => {
      events.push(`rire ${at}`);
      return true;
    });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(events.filter((event) => event.startsWith("rire") || event === "vidéo finie")).toEqual([
      "rire 1000",
      "vidéo finie",
      "rire 3000",
    ]);
    expect(laughFiles.play.mock.calls.map(([laugh]) => laugh)).toEqual([FIRST, SECOND]);
  });

  it("garde la dernière image du clip jusqu'à la fin du dernier rire, puis passe à la suite", async () => {
    const { events } = setupWithVideo(async () => undefined);
    const finishes: (() => void)[] = [];
    laughFiles.play.mockImplementation(
      () => new Promise<boolean>((resolve) => finishes.push(() => resolve(true))),
    );
    await vi.advanceTimersByTimeAsync(20_000);
    expect(finishes).toHaveLength(2);
    expect(events).toContain("vue clip");
    expect(events).not.toContain("vue closing");
    finishes[0]?.();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(events).not.toContain("vue closing");
    finishes[1]?.();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(events).toContain("vue closing");
  });

  it("fait dire la phrase des rires une seule fois, après le clip, même quand plusieurs rires ont joué", async () => {
    setupWithVideo(async () => undefined);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(spokenKinds()).toEqual(["opening", "clip", "laugh", "closing"]);
  });

  it("fait dire la phrase dès qu'un seul rire a joué jusqu'au bout", async () => {
    laughFiles.play.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    setupWithVideo(async () => undefined);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(spokenKinds()).toContain("laugh");
  });

  it("n'enchaîne pas la phrase des rires quand aucun rire n'a joué", async () => {
    laughFiles.play.mockResolvedValue(false);
    setupWithVideo(async () => undefined);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(spokenKinds()).not.toContain("laugh");
  });

  it("coupe les rires aussitôt quand l'émission s'arrête, sans phrase ni suite", async () => {
    const { run, events } = setupWithVideo(async () => undefined);
    laughFiles.play.mockImplementation(
      () =>
        new Promise<boolean>((resolve) =>
          vi.mocked(createLaughFiles).mock.calls[0]?.[0].then(() => resolve(false)),
        ),
    );
    await vi.advanceTimersByTimeAsync(10_000);
    run.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(laughFiles.clear).toHaveBeenCalled();
    expect(spokenKinds()).not.toContain("laugh");
    expect(events).not.toContain("vue closing");
  });

  it("libère les fichiers de rire à la fin de l'émission", async () => {
    setupWithVideo(async () => undefined);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(laughFiles.clear).toHaveBeenCalledTimes(1);
  });
});

describe("startRun : le fader du son de l'émission", () => {
  // Deux vidéos qui ne notent que leur volume : `toEqual` voit tout ce que l'émission toucherait d'autre. Les rires et la voix de
  // Jean-Renard reçoivent chacun les faders atteints (`laughFiles.setFader` et `foxFaders`).
  const setupWithFader = (showFader: number) => {
    const videos = [0, 1].map(() => ({ pause: () => undefined, volume: 1 }) as HTMLVideoElement);
    const foxFaders: number[] = [];
    const run = startRun(
      { ...state, showFader },
      {
        videoOf: (slot) => videos[slot] ?? null,
        setView: () => undefined,
        addChat: () => undefined,
        clearChat: () => undefined,
        setFoxMode: () => undefined,
        setFoxFader: (fader) => foxFaders.push(fader),
      },
    );
    return { run, videos, foxFaders };
  };
  // `.volume` d'une vidéo est le fader divisé par 100.
  const reachedBy = (videos: HTMLVideoElement[]) => videos.map(({ volume }) => volume);
  const fadedTo = (value: number) => ({ pause: expect.any(Function), volume: value });
  const laughFadersOf = () => laughFiles.setFader.mock.calls.map(([fader]) => fader);

  it("pose le fader de départ tout de suite sur les deux vidéos, sans fondu", () => {
    const { videos } = setupWithFader(15);
    expect(videos).toEqual([fadedTo(0.15), fadedTo(0.15)]);
  });

  it("laisse le son entier quand le fader de départ est à 100", () => {
    const { videos } = setupWithFader(100);
    expect(videos).toEqual([fadedTo(1), fadedTo(1)]);
  });

  it("fond vers un nouveau fader en 300 ms sur les deux vidéos : rien d'un coup, 0,15 à l'arrivée, rien d'autre ne change", async () => {
    const { run, videos } = setupWithFader(100);
    run.updateFader(15);
    expect(reachedBy(videos)).toEqual([1, 1]);
    await vi.advanceTimersByTimeAsync(150);
    for (const value of reachedBy(videos)) {
      expect(value).toBeGreaterThan(0.5);
      expect(value).toBeLessThan(0.8);
    }
    await vi.advanceTimersByTimeAsync(150);
    expect(videos).toEqual([fadedTo(0.15), fadedTo(0.15)]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(videos).toEqual([fadedTo(0.15), fadedTo(0.15)]);
  });

  it("remonte en fondu de la même façon", async () => {
    const { run, videos } = setupWithFader(15);
    run.updateFader(100);
    await vi.advanceTimersByTimeAsync(299);
    for (const value of reachedBy(videos)) expect(value).toBeLessThan(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(videos).toEqual([fadedTo(1), fadedTo(1)]);
  });

  it("remplace un fondu en cours : le nouveau repart de la valeur atteinte, sans saut", async () => {
    const { run, videos } = setupWithFader(100);
    run.updateFader(15);
    await vi.advanceTimersByTimeAsync(140);
    const reached = videos[0]?.volume ?? 0;
    expect(reached).toBeLessThan(1);
    expect(reached).toBeGreaterThan(0.15);
    run.updateFader(100);
    expect(reachedBy(videos)).toEqual([reached, reached]);
    let previous = reached;
    for (let step = 0; step < 15; step += 1) {
      await vi.advanceTimersByTimeAsync(20);
      const value = videos[0]?.volume ?? 0;
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
    expect(videos).toEqual([fadedTo(1), fadedTo(1)]);
  });

  it("ne lance aucun fondu quand le fader est celui d'avant", () => {
    const { run, videos } = setupWithFader(100);
    const timers = vi.getTimerCount();
    run.updateFader(100);
    expect(vi.getTimerCount()).toBe(timers);
    expect(videos).toEqual([fadedTo(1), fadedTo(1)]);
  });

  it("annule le fondu quand l'émission s'arrête : le son reste où il en est, plus aucun minuteur", async () => {
    const { run, videos } = setupWithFader(100);
    run.updateFader(15);
    await vi.advanceTimersByTimeAsync(100);
    run.stop();
    const reached = reachedBy(videos);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(reachedBy(videos)).toEqual(reached);
  });

  it("ne lance rien quand un fader arrive après l'arrêt", async () => {
    const { run, videos } = setupWithFader(100);
    run.stop();
    run.updateFader(15);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(reachedBy(videos)).toEqual([1, 1]);
  });

  it("n'échoue pas quand la page n'a pas ses vidéos", async () => {
    const { run } = setup({ ...state, showFader: 15 });
    expect(() => run.updateFader(100)).not.toThrow();
    await vi.advanceTimersByTimeAsync(1000);
  });

  it("pose le fader de départ tout de suite sur les rires et sur la voix de Jean-Renard, comme sur les vidéos", () => {
    const { foxFaders } = setupWithFader(15);
    expect(laughFadersOf()).toEqual([15]);
    expect(foxFaders).toEqual([15]);
  });

  it("Quand le fader passe à 15, les vidéos, les rires et la voix doivent recevoir le même fader à chaque pas du fondu, jusqu'à 15 en 300 ms", async () => {
    const { run, videos, foxFaders } = setupWithFader(100);
    run.updateFader(15);
    await vi.advanceTimersByTimeAsync(150);
    const halfway = foxFaders.at(-1) ?? 100;
    expect(halfway).toBeGreaterThan(15);
    expect(halfway).toBeLessThan(100);
    expect(videos[0]?.volume).toBeCloseTo(halfway / 100, 6);
    await vi.advanceTimersByTimeAsync(150);
    expect(foxFaders.at(-1)).toBe(15);
    expect(laughFadersOf()).toEqual(foxFaders);
    expect(foxFaders.length).toBeGreaterThan(5);
    expect(foxFaders.slice(1)).toEqual([...foxFaders.slice(1)].sort((first, second) => second - first));
    await vi.advanceTimersByTimeAsync(5000);
    expect(foxFaders.at(-1)).toBe(15);
    expect(laughFadersOf()).toEqual(foxFaders);
  });

  it("fond de la même façon à la remontée, et ne sort rien de plus à l'arrêt", async () => {
    const { run, videos, foxFaders } = setupWithFader(15);
    run.updateFader(100);
    await vi.advanceTimersByTimeAsync(300);
    expect(foxFaders.at(-1)).toBe(100);
    expect(laughFadersOf()).toEqual(foxFaders);
    expect(videos[1]?.volume).toBe(1);
    run.updateFader(15);
    await vi.advanceTimersByTimeAsync(100);
    run.stop();
    const sent = foxFaders.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(foxFaders).toHaveLength(sent);
    expect(laughFadersOf()).toEqual(foxFaders);
  });
});

describe("startRun : le fader de l'émission sur de vrais rires", () => {
  // Un faux <audio> : il note son volume ; un faux serveur donne aux rires un fichier.
  class FakeAudio {
    static instances: FakeAudio[] = [];
    volume = 1;

    constructor(readonly src: string) {
      FakeAudio.instances.push(this);
    }

    addEventListener(): void {
      // Aucun rire ne finit dans ce test.
    }

    async play(): Promise<void> {
      // La lecture est acceptée.
    }

    pause(): void {
      // Rien à couper.
    }

    removeAttribute(): void {
      // Rien à retirer.
    }

    load(): void {
      // Rien à recharger.
    }
  }

  const FIRST: ShowLaugh = { id: "rires001", version: "1", fader: 80, at: 1000 };
  const SECOND: ShowLaugh = { id: "rires002", version: "2", fader: 60, at: 3000 };

  beforeEach(() => {
    FakeAudio.instances = [];
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Blob(["son"]))),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Quand le fader de l'émission passe à 15, un rire qui joue doit atteindre son fader × 0,15 en 300 ms, et un rire qui part ensuite doit partir directement à cette valeur", async () => {
    const actual = await vi.importActual<typeof import("./show-laugh")>("./show-laugh");
    vi.mocked(createLaughFiles).mockImplementation(actual.createLaughFiles);
    vi.mocked(prepareVideo).mockResolvedValue(true);
    let finishVideo: () => void = () => undefined;
    vi.mocked(playVideo).mockImplementation(async (_video, _aborted, onTime) => {
      onTime(1500);
      await new Promise<void>((resolve) => {
        finishVideo = resolve;
      });
    });
    const videos = [0, 1].map(() => ({ pause: () => undefined, volume: 1 }) as HTMLVideoElement);
    const foxFaders: number[] = [];
    const run = startRun(
      {
        ...state,
        lineup: [
          {
            name: "a.mp4",
            title: "A",
            version: "1-1",
            day: "2026-10-16",
            durationMs: 10_000,
            laughs: [FIRST, SECOND],
          },
        ],
      },
      {
        videoOf: (slot) => videos[slot] ?? null,
        setView: () => undefined,
        addChat: () => undefined,
        clearChat: () => undefined,
        setFoxMode: () => undefined,
        setFoxFader: (fader) => foxFaders.push(fader),
      },
    );
    await vi.advanceTimersByTimeAsync(20_000);
    expect(FakeAudio.instances.map(({ volume }) => volume)).toEqual([0.8]);
    run.updateFader(15);
    await vi.advanceTimersByTimeAsync(150);
    const halfway = FakeAudio.instances[0]?.volume ?? 0;
    expect(halfway).toBeGreaterThan(0.8 * 0.15);
    expect(halfway).toBeLessThan(0.8);
    await vi.advanceTimersByTimeAsync(150);
    expect(FakeAudio.instances[0]?.volume).toBeCloseTo(0.8 * 0.15, 6);
    expect(videos[0]?.volume).toBeCloseTo(0.15, 6);
    expect(foxFaders.at(-1)).toBe(15);
    finishVideo();
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeAudio.instances).toHaveLength(2);
    expect(FakeAudio.instances[1]?.volume).toBeCloseTo(0.6 * 0.15, 6);
    run.stop();
  });
});
