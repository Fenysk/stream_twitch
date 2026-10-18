import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShowClip, ShowCues, ShowLaugh } from "../../domain/show.schema";
import { type EpisodeDeps, runEpisode, type Speech } from "./show-run";
import type { ShowView, Slot } from "./show-view";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
});

const A: ShowClip = {
  name: "a.mp4",
  title: "Titre A",
  version: "1-1",
  day: "2026-10-16",
  durationMs: 20_000,
  laughs: [],
};
const B: ShowClip = {
  name: "b.mp4",
  title: "Titre B",
  version: "1-1",
  day: "2026-10-16",
  durationMs: 30_000,
  laughs: [],
};

// Une page de test : chaque appel de l'écran, de la voix et du rapport se note avec l'heure (ms depuis le début), et la fin d'un clip
// se donne à la main.
const setup = (
  lineup: ShowClip[] = [A],
  options: {
    speechMs?: number;
    speechDelayMs?: number;
    isLoaded?: (name: string) => boolean;
    speak?: EpisodeDeps["speak"];
    // Les données que le serveur donne de chaque clip (rien par défaut).
    cues?: ShowCues | null;
  } = {},
) => {
  const events: string[] = [];
  // Les instants du retour de Fenysk reçus, à part des évènements : ils ne changent pas l'ordre qu'on y vérifie.
  const returnAts: number[] = [];
  const cuesAsked: string[] = [];
  const playedWith: (ShowCues | null)[] = [];
  const playedLaughs: (readonly ShowLaugh[])[] = [];
  const plays = new Map<Slot, (hasLaughed: boolean) => void>();
  let isStopped = false;
  const at = () => `${Date.now()}ms`;
  const nameOf = (speech: Speech): string => (speech.kind === "clip" ? `clip ${speech.index}` : speech.kind);
  const describeView = (view: ShowView): string => {
    if (view.kind === "card") return `carton « ${view.title} »`;
    if (view.kind === "clip") return `clip ${view.slot} « ${view.title} »`;
    return view.kind;
  };
  const deps: EpisodeDeps = {
    screen: {
      setView: (view) => events.push(`${at()} vue ${describeView(view)}`),
      setReturnAt: (instant) => returnAts.push(instant),
      async load(slot, { name }) {
        const isLoaded = options.isLoaded?.(name) ?? true;
        events.push(`${at()} charge ${name} dans ${slot}${isLoaded ? "" : " (échec)"}`);
        return isLoaded;
      },
      play(slot, cues, laughs) {
        events.push(`${at()} joue ${slot}`);
        playedWith.push(cues);
        playedLaughs.push(laughs);
        return new Promise<boolean>((resolve) => {
          plays.set(slot, resolve);
        });
      },
    },
    loadCues: async ({ name }) => {
      cuesAsked.push(name);
      return options.cues ?? null;
    },
    speak:
      options.speak ??
      (async (speech) => {
        events.push(`${at()} phrase demandée ${nameOf(speech)}`);
        await sleep(options.speechDelayMs ?? 0);
        return options.speechMs ?? 0;
      }),
    report: ({ phase, index }) => events.push(`${at()} rapport ${phase} ${index}`),
    sleep,
    now: Date.now,
    isStopped: () => isStopped,
    log: (message) => events.push(`${at()} journal ${message}`),
  };
  return {
    events,
    returnAts,
    cuesAsked,
    playedWith,
    playedLaughs,
    run: () => runEpisode(deps, lineup),
    // Le clip est fini (et ses rires) ; `hasLaughed` : au moins un rire a joué jusqu'au bout.
    finish: (slot: Slot, hasLaughed = false) => plays.get(slot)?.(hasLaughed),
    stop: () => {
      isStopped = true;
    },
  };
};

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);

describe("l'ouverture", () => {
  it("montre Jean-Renard au centre, charge le premier clip pendant qu'il parle, et lui laisse 2,5 s sans phrase", async () => {
    const { events, run } = setup();
    void run();
    await advance(0);
    expect(events).toEqual([
      "0ms rapport opening 0",
      "0ms vue opening",
      "0ms charge a.mp4 dans 0",
      "0ms phrase demandée opening",
    ]);
    await advance(2499);
    expect(events.some((event) => event.includes("rapport card"))).toBe(false);
    await advance(1);
    expect(events).toContain("2500ms rapport card 0");
  });

  it("la garde jusqu'à la fin de la phrase plus 0,7 s : la synthèse arrive après 1,5 s, la phrase dure 4 s", async () => {
    const { events, run } = setup([A], { speechMs: 4000, speechDelayMs: 1500 });
    void run();
    await advance(6199);
    expect(events.some((event) => event.includes("vue carton"))).toBe(false);
    await advance(1);
    expect(events).toContain("6200ms vue carton « Titre A »");
  });
});

describe("le carton d'un clip", () => {
  it("montre le titre, demande la phrase du clip, laisse 3 s sans phrase, puis passe au clip dans son emplacement", async () => {
    const { events, run } = setup();
    void run();
    await advance(2500);
    expect(events.slice(4)).toEqual([
      "2500ms rapport card 0",
      "2500ms vue carton « Titre A »",
      "2500ms phrase demandée clip 0",
    ]);
    await advance(2999);
    expect(events).not.toContain("5500ms rapport clip 0");
    await advance(1);
    expect(events.slice(7)).toEqual([
      "5500ms rapport clip 0",
      "5500ms vue clip 0 « Titre A »",
      "5500ms joue 0",
    ]);
  });

  it("garde le carton jusqu'à la fin de la phrase plus 0,5 s : la synthèse arrive après 1,5 s, la phrase dure 4 s", async () => {
    const { events, run } = setup([A], { speechMs: 4000, speechDelayMs: 1500 });
    void run();
    // L'ouverture dure 1500 + 4000 + 700 = 6200 ms, puis le carton 1500 + 4000 + 500 = 6000 ms.
    await advance(6200 + 5999);
    expect(events.some((event) => event.includes("vue clip"))).toBe(false);
    await advance(1);
    expect(events).toContain("12200ms vue clip 0 « Titre A »");
  });

  it("garde 3 s quand la phrase est plus courte que ça, et 3 s aussi quand la voix échoue", async () => {
    const short = setup([A], { speechMs: 400 });
    void short.run();
    await advance(2500 + 3000);
    expect(short.events).toContain("5500ms vue clip 0 « Titre A »");

    const failing = setup([A], {
      speak: async () => {
        throw new Error("synthèse impossible");
      },
    });
    void failing.run();
    await advance(2500 + 3000);
    expect(failing.events.some((event) => event.endsWith("vue clip 0 « Titre A »"))).toBe(true);
    expect(failing.events.join("\n")).toContain("synthèse impossible");
  });

  it("passe sans la phrase quand la voix ne répond pas en 15 s", async () => {
    const { events, run } = setup([A], { speak: () => new Promise<number>(() => undefined) });
    void run();
    // Le temps de l'ouverture est passé quand la voix s'est tue 15 s : la suite suit aussitôt (un minuteur de 0 ms lancé pendant un
    // pas des faux minuteurs compte 1 ms).
    await advance(15_001);
    expect(events).toContain("15001ms rapport card 0");
    await advance(15_001);
    expect(events).toContain("30002ms rapport clip 0");
  });
});

describe("les clips", () => {
  it("prépare le clip suivant dans l'autre emplacement pendant que celui-ci joue", async () => {
    const { events, run } = setup([A, B]);
    void run();
    await advance(5500);
    const sinceClip = events.slice(events.indexOf("5500ms rapport clip 0"));
    expect(sinceClip).toEqual([
      "5500ms rapport clip 0",
      "5500ms vue clip 0 « Titre A »",
      "5500ms joue 0",
      "5500ms charge b.mp4 dans 1",
    ]);
  });

  it("passe au carton du suivant dès la fin d'un clip, sans noir en plus, puis le joue dans l'autre emplacement", async () => {
    const { events, run, finish } = setup([A, B]);
    void run();
    await advance(5500);
    finish(0);
    await advance(0);
    expect(events.slice(-3)).toEqual([
      "5500ms rapport card 1",
      "5500ms vue carton « Titre B »",
      "5500ms phrase demandée clip 1",
    ]);
    await advance(3000);
    expect(events).toContain("8500ms vue clip 1 « Titre B »");
    expect(events).toContain("8500ms joue 1");
  });

  it("saute un clip qui ne se lit pas et le dit dans le journal", async () => {
    const { events, run } = setup(
      [
        {
          name: "cassé.mp4",
          title: "Cassé",
          version: "1-1",
          day: "2026-10-16",
          durationMs: 5000,
          laughs: [],
        },
        { name: "bon.mp4", title: "Bon", version: "1-1", day: "2026-10-16", durationMs: 30_000, laughs: [] },
      ],
      { isLoaded: (name) => name !== "cassé.mp4" },
    );
    void run();
    await advance(2500);
    expect(events).toContain("0ms charge cassé.mp4 dans 0 (échec)");
    expect(events).toContain("2500ms vue carton « Bon »");
    expect(events.join("\n")).toContain("« cassé.mp4 » ne se lit pas");
    expect(events.some((event) => event.includes("carton « Cassé »"))).toBe(false);
  });
});

describe("les données d'un clip", () => {
  const CUES: ShowCues = { chat: [], spikes: [1000], startleMs: 1000 };

  it("demande celles du clip en même temps que sa vidéo, avant d'en avoir besoin, et les donne à la lecture", async () => {
    const { cuesAsked, playedWith, run } = setup([A, B], { cues: CUES });
    void run();
    await advance(0);
    expect(cuesAsked).toEqual(["a.mp4"]);
    await advance(5500);
    expect(cuesAsked).toEqual(["a.mp4", "b.mp4"]);
    expect(playedWith).toEqual([CUES]);
  });

  it("joue quand même un clip dont le serveur n'a pas donné les données : sans tchat ni sursauts", async () => {
    const { events, playedWith, run } = setup([A], { cues: null });
    void run();
    await advance(5500);
    expect(events).toContain("5500ms joue 0");
    expect(playedWith).toEqual([null]);
  });
});

describe("les rires d'un clip", () => {
  const FIRST: ShowLaugh = { id: "rires001", version: "1", fader: 80, at: 2000 };
  const SECOND: ShowLaugh = { id: "rires002", version: "1", fader: 60, at: 4000 };
  const laughing: ShowClip = { ...A, laughs: [FIRST, SECOND] };

  it("donne à la lecture les rires du clip, avec ses données, pour que la page les fasse partir à leur instant", async () => {
    const { playedLaughs, run } = setup([laughing, B]);
    void run();
    await advance(5500);
    expect(playedLaughs).toEqual([[FIRST, SECOND]]);
  });

  it("dit la phrase des rires une seule fois quand au moins un rire a joué, même avec plusieurs rires", async () => {
    const { events, run, finish } = setup([laughing, B]);
    void run();
    await advance(5500);
    finish(0, true);
    await advance(0);
    expect(events.filter((event) => event.includes("phrase demandée laugh"))).toEqual([
      "5500ms phrase demandée laugh",
    ]);
    expect(events.slice(events.indexOf("5500ms phrase demandée laugh") - 1)).toEqual([
      "5500ms charge b.mp4 dans 1",
      "5500ms phrase demandée laugh",
    ]);
  });

  it("garde le clip jusqu'à la fin de la phrase des rires plus 0,5 s avant de passer au carton suivant", async () => {
    const { events, run, finish } = setup([laughing, B], {
      speak: async (speech) => {
        await sleep(0);
        return speech.kind === "laugh" ? 2000 : 0;
      },
    });
    void run();
    await advance(5500);
    // L'ouverture dure 2,5 s, le carton 3 s : le clip commence à 5500 ms. La phrase des rires dure 2 s, plus 0,5 s.
    finish(0, true);
    await advance(2499);
    expect(events.some((event) => event.includes("carton « Titre B »"))).toBe(false);
    await advance(1);
    expect(events.some((event) => event.includes("carton « Titre B »"))).toBe(true);
  });

  it("garde le clip à l'écran tant que ses rires jouent : le carton suivant attend la fin du dernier rire", async () => {
    const { events, run, finish } = setup([laughing, B]);
    void run();
    await advance(5500);
    await advance(20_000);
    expect(events.some((event) => event.includes("carton « Titre B »"))).toBe(false);
    expect(events.some((event) => event.includes("phrase demandée laugh"))).toBe(false);
    finish(0, true);
    await advance(0);
    expect(events).toContain("25500ms phrase demandée laugh");
  });

  it("ne dit pas la phrase des rires quand aucun n'a joué jusqu'au bout : fichiers supprimés ou illisibles, sans erreur", async () => {
    const { events, run, finish } = setup([laughing, B]);
    void run();
    await advance(5500);
    finish(0, false);
    await advance(0);
    expect(events.some((event) => event.includes("phrase demandée laugh"))).toBe(false);
    expect(events).toContain("5500ms rapport card 1");
  });

  it("ne dit rien pour un clip sans rires, ni pour une émission arrêtée pendant les rires", async () => {
    const quiet = setup([A, B]);
    void quiet.run();
    await advance(5500);
    quiet.finish(0);
    await advance(0);
    expect(quiet.events.some((event) => event.includes("phrase demandée laugh"))).toBe(false);

    const stopped = setup([laughing, B]);
    void stopped.run();
    await advance(5500);
    stopped.stop();
    stopped.finish(0, true);
    await advance(0);
    expect(stopped.events.some((event) => event.includes("phrase demandée laugh"))).toBe(false);
  });
});

describe("la clôture et la fin", () => {
  it("après le dernier clip : la clôture au centre, puis l'émission est finie et la page redevient transparente", async () => {
    const { events, run, finish } = setup();
    const done = run();
    await advance(5500);
    finish(0);
    await advance(0);
    expect(events.slice(-3)).toEqual([
      "5500ms rapport closing 0",
      "5500ms vue closing",
      "5500ms phrase demandée closing",
    ]);
    await advance(2500);
    await done;
    expect(events.slice(-2)).toEqual(["8000ms rapport ended 0", "8000ms vue none"]);
  });

  it("déroule dans l'ordre : ouverture, carton et clip de chacun, clôture, fin", async () => {
    const { events, run, finish } = setup([A, B]);
    const done = run();
    await advance(5500);
    finish(0);
    await advance(3000);
    finish(1);
    await advance(2500);
    await done;
    expect(
      events.filter((event) => event.includes("rapport")).map((event) => event.replace(/^\d+ms /, "")),
    ).toEqual([
      "rapport opening 0",
      "rapport card 0",
      "rapport clip 0",
      "rapport card 1",
      "rapport clip 1",
      "rapport closing 0",
      "rapport ended 0",
    ]);
  });

  it("passe l'ouverture puis la clôture quand l'émission n'a aucun clip", async () => {
    const { events, run } = setup([]);
    const done = run();
    await advance(5000);
    await done;
    expect(
      events.filter((event) => event.includes("vue")).map((event) => event.replace(/^\d+ms /, "")),
    ).toEqual(["vue opening", "vue closing", "vue none"]);
  });

  it("s'arrête quand l'émission est arrêtée : plus aucune vue ni rapport après, pas de fin annoncée", async () => {
    const { events, run, finish, stop } = setup([A, B]);
    const done = run();
    await advance(5500);
    stop();
    finish(0);
    await advance(30_000);
    await done;
    expect(events.filter((event) => event.includes("carton"))).toHaveLength(1);
    expect(events.some((event) => event.includes("closing") || event.includes("ended"))).toBe(false);
  });
});

describe("l'instant du retour de Fenysk", () => {
  const FIRST: ShowLaugh = { id: "rires001", version: "1", fader: 80, at: 2000 };
  const laughing: ShowClip = { ...A, laughs: [FIRST] };
  // La phrase estimée donne : carton 6000 ms, phrase des rires 6000 ms, ouverture et clôture 6200 ms. Le clip A (20 s, un rire) pèse
  // 32 000 ms en tout, le clip B (30 s, sans rire) 36 000 ms.

  it("le donne à chaque temps, à partir de ce qui reste : ouverture, carton, clip, rires, carton suivant, clip suivant, clôture", async () => {
    // Seule la phrase des rires dure (2 s) : l'ouverture dure 2,5 s, un carton 3 s, la phrase des rires 2,5 s.
    const { returnAts, run, finish } = setup([laughing, B], {
      speak: async (speech) => (speech.kind === "laugh" ? 2000 : 0),
    });
    void run();
    await advance(0);
    expect(returnAts).toEqual([6200 + 32_000 + 36_000 + 6200]);
    await advance(2500);
    expect(returnAts.at(-1)).toBe(2500 + 32_000 + 36_000 + 6200);
    await advance(3000);
    expect(returnAts.at(-1)).toBe(5500 + 20_000 + 6000 + 36_000 + 6200);
    await advance(19_500);
    finish(0, true);
    await advance(0);
    expect(returnAts.at(-1)).toBe(25_000 + 6000 + 36_000 + 6200);
    await advance(2500);
    expect(returnAts.at(-1)).toBe(27_500 + 36_000 + 6200);
    await advance(3000);
    expect(returnAts.at(-1)).toBe(30_500 + 30_000 + 6200);
    await advance(30_000);
    finish(1);
    await advance(0);
    expect(returnAts).toEqual([80_400, 76_700, 73_700, 73_200, 69_700, 66_700, 66_700]);
  });

  it("ne le donne pas aux rires quand aucun n'a joué : le carton suivant le recalcule", async () => {
    const { returnAts, run, finish } = setup([laughing, B]);
    void run();
    await advance(5500);
    finish(0, false);
    await advance(0);
    expect(returnAts).toEqual([80_400, 76_700, 73_700, 5500 + 36_000 + 6200]);
  });

  it("ne le donne pas pour un clip qui ne se lit pas : le carton suivant le recalcule", async () => {
    const { returnAts, run } = setup(
      [
        {
          name: "cassé.mp4",
          title: "Cassé",
          version: "1-1",
          day: "2026-10-16",
          durationMs: 5000,
          laughs: [],
        },
        B,
      ],
      { isLoaded: (name) => name !== "cassé.mp4" },
    );
    void run();
    await advance(5500);
    // Ouverture : 6200 + (6000 + 5000) + 36 000 + 6200 ; carton de B à 2500 ms ; B à 5500 ms.
    expect(returnAts).toEqual([59_400, 2500 + 36_000 + 6200, 5500 + 30_000 + 6200]);
  });
});
