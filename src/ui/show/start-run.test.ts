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
  lineup: [{ name: "a.mp4", title: "A", version: "1-1", day: "2026-10-16", laughs: [] }],
  phase: "opening",
  index: 0,
  startsAt: 0,
};

// Une page sans vidéo : le clip ne se charge pas et est passé, le reste du déroulé a lieu.
const setup = (shown: ShowState = state) => {
  const views: ShowView[] = [];
  const modes: FoxMode[] = [];
  const run = startRun(shown, {
    videoOf: () => null,
    setView: (view) => views.push(view),
    addChat: () => undefined,
    clearChat: () => undefined,
    setFoxMode: (mode) => modes.push(mode),
  });
  return { run, views, modes };
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
    lineup: [{ name: "a.mp4", title: "A", version: "1-1", day: "2026-10-16", laughs: [FIRST, SECOND] }],
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
