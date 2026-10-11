import { afterEach, describe, expect, it, vi } from "vitest";
import type { Head, HeadView, Pose } from "../domain/head.types";
import type { Settings } from "../domain/settings.schema";
import { createHeadFeed, createHeadLoop } from "./head.usecase";

const cut = { left: { x: 1, y: 2 }, right: { x: 3, y: 4 } };
const closed: HeadView = {
  width: 10,
  height: 10,
  cut,
  tilt: 1,
  opening: 1,
  scale: 1,
  mouth: { kind: "closed" },
};
const open: HeadView = { ...closed, mouth: { kind: "open", pose: { pivot: "left", angle: -7 } } };

describe("createHeadFeed", () => {
  it("donne l'état de départ, puis le dernier état publié", () => {
    const feed = createHeadFeed(closed);
    expect(feed.getView()).toBe(closed);
    feed.publish(open);
    expect(feed.getView()).toBe(open);
  });

  it("prévient chaque abonné de chaque état publié", () => {
    const feed = createHeadFeed(closed);
    const first: HeadView[] = [];
    const second: HeadView[] = [];
    feed.subscribe((view) => first.push(view));
    feed.subscribe((view) => second.push(view));
    feed.publish(open);
    expect(first).toEqual([open]);
    expect(second).toEqual([open]);
  });

  it("ne prévient plus un abonné qui s'est désabonné", () => {
    const feed = createHeadFeed(closed);
    const received: HeadView[] = [];
    const unsubscribe = feed.subscribe((view) => received.push(view));
    unsubscribe();
    feed.publish(open);
    expect(received).toEqual([]);
  });
});

describe("createHeadLoop", () => {
  const poseA: Pose = { pivot: "right", angle: 7 };
  const poseB: Pose = { pivot: "left", angle: -14 };
  const poseC: Pose = { pivot: "center", angle: 3, lift: 0.11 };
  const head: Head = {
    width: 577,
    height: 433,
    cut,
    poses: [poseA, poseB, poseC],
    rhythm: 110,
    opening: 1.3,
    closedChance: 0.22,
  };
  const settings: Settings = {
    obsAddress: "ws://127.0.0.1:4455",
    micName: "Mic/Aux",
    threshold: -40,
    delay: 250,
  };

  const createFakeMic = () => {
    const listeners = new Set<(level: number) => void>();
    return {
      subscribe(listener: (level: number) => void) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      emit(level: number) {
        for (const listener of listeners) listener(level);
      },
      count: () => listeners.size,
    };
  };

  const setup = (override: Partial<Settings> = {}) => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const mic = createFakeMic();
    const loop = createHeadLoop({
      mic,
      head,
      settings: { ...settings, ...override },
      clock: () => Date.now(),
      random: () => 0.5,
    });
    const views: HeadView[] = [];
    loop.feed.subscribe((view) => views.push(view));
    loop.start();
    return { mic, loop, views };
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it("commence bouche fermée, avec la géométrie de la tête", () => {
    const { loop } = setup();
    expect(loop.feed.getView()).toEqual({
      width: 577,
      height: 433,
      cut,
      tilt: 1.3,
      opening: 1.3,
      scale: 1,
      mouth: { kind: "closed" },
    });
  });

  it("ne publie rien tant que le mic reste sous le threshold", () => {
    const { mic, views } = setup();
    mic.emit(-60);
    vi.advanceTimersByTime(1000);
    mic.emit(-40);
    vi.advanceTimersByTime(1000);
    expect(views).toEqual([]);
  });

  it("publie une pose à chaque pas du rythme tant qu'elle parle, puis ferme la bouche après le delay", () => {
    const { mic, views } = setup();
    mic.emit(-30);
    vi.advanceTimersByTime(110);
    vi.advanceTimersByTime(110);
    vi.advanceTimersByTime(110);
    vi.advanceTimersByTime(110);
    expect(views.map((view) => view.mouth.kind)).toEqual(["open", "open", "closed"]);
    const [first, second] = views.map((view) => view.mouth);
    expect(first?.kind === "open" && second?.kind === "open" && first.pose !== second.pose).toBe(true);
  });

  it("renouvelle le delay à chaque level au-dessus du threshold, pas à chaque level", () => {
    const { mic, views } = setup();
    mic.emit(-30);
    vi.advanceTimersByTime(200);
    mic.emit(-30);
    mic.emit(-60);
    vi.advanceTimersByTime(250);
    expect(views.at(-1)?.mouth.kind).toBe("open");
    vi.advanceTimersByTime(110);
    expect(views.at(-1)?.mouth.kind).toBe("closed");
  });

  it("prend le rythme des settings quand il y est, sinon celui de la tête", () => {
    const withHeadRhythm = setup();
    withHeadRhythm.mic.emit(-30);
    vi.advanceTimersByTime(109);
    expect(withHeadRhythm.views).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(withHeadRhythm.views).toHaveLength(1);
    vi.useRealTimers();

    const withSettingsRhythm = setup({ rhythm: 50 });
    withSettingsRhythm.mic.emit(-30);
    vi.advanceTimersByTime(50);
    expect(withSettingsRhythm.views).toHaveLength(1);
  });

  it("prend l'ouverture des settings quand elle y est, sinon celle de la tête", () => {
    const withSettingsOpening = setup({ opening: 2 });
    expect(withSettingsOpening.loop.feed.getView().opening).toBe(2);
    withSettingsOpening.mic.emit(-30);
    vi.advanceTimersByTime(110);
    expect(withSettingsOpening.views.at(-1)?.opening).toBe(2);
  });

  it("prend le tilt des settings sans toucher à l'opening", () => {
    const { loop, mic, views } = setup({ tilt: 1, opening: 1.8 });
    expect(loop.feed.getView()).toMatchObject({ tilt: 1, opening: 1.8 });
    mic.emit(-30);
    vi.advanceTimersByTime(110);
    expect(views.at(-1)).toMatchObject({ tilt: 1, opening: 1.8 });
    expect(setup({ tilt: 0.5 }).loop.feed.getView()).toMatchObject({ tilt: 0.5, opening: 1.3 });
  });

  it("donne au tilt la valeur de l'opening quand les settings n'ont pas de tilt", () => {
    expect(setup().loop.feed.getView()).toMatchObject({ tilt: 1.3, opening: 1.3 });
    expect(setup({ opening: 2 }).loop.feed.getView()).toMatchObject({ tilt: 2, opening: 2 });
  });

  describe("scale selon le level de la voix", () => {
    const curve = { quietScale: 0.5, loudScale: 1.5, loudLevel: -10 };

    it("vaut 1 à chaque pas quand les settings n'ont pas de courbe", () => {
      const { mic, views } = setup();
      mic.emit(-10);
      vi.advanceTimersByTime(110);
      mic.emit(-30);
      vi.advanceTimersByTime(110);
      expect(views.map((view) => view.scale)).toEqual([1, 1]);
    });

    it("suit le level du pas : loudScale au loudLevel, puis quietScale quand plus rien n'arrive", () => {
      const { mic, views } = setup(curve);
      mic.emit(-10);
      vi.advanceTimersByTime(110);
      expect(views.at(-1)?.scale).toBeCloseTo(1.5, 9);
      vi.advanceTimersByTime(110);
      expect(views.at(-1)?.mouth.kind).toBe("open");
      expect(views.at(-1)?.scale).toBeCloseTo(0.5, 9);
    });

    it("prend le level le plus fort reçu depuis le pas précédent, pas le dernier", () => {
      const { mic, views } = setup(curve);
      mic.emit(-30);
      mic.emit(-10);
      mic.emit(-35);
      vi.advanceTimersByTime(110);
      expect(views.at(-1)?.scale).toBeCloseTo(1.5, 9);
    });

    it("interpole en dB entre le threshold et le loudLevel", () => {
      const { mic, views } = setup(curve);
      mic.emit(-25);
      vi.advanceTimersByTime(110);
      expect(views.at(-1)?.scale).toBeCloseTo(1, 9);
    });

    it("ancre la montée sur le quietLevel quand les settings en ont un", () => {
      const { mic, views } = setup({ ...curve, quietLevel: -25 });
      mic.emit(-39);
      vi.advanceTimersByTime(110);
      expect(views.at(-1)?.scale).toBeCloseTo(0.5, 9);
      mic.emit(-17.5);
      vi.advanceTimersByTime(110);
      expect(views.at(-1)?.scale).toBeCloseTo(1, 9);
      mic.emit(-10);
      vi.advanceTimersByTime(110);
      expect(views.at(-1)?.scale).toBeCloseTo(1.5, 9);
    });

    it("ne change pas la décision fermée ou ouverte : sous le threshold, la bouche reste fermée", () => {
      const { mic, views } = setup(curve);
      mic.emit(-45);
      vi.advanceTimersByTime(1000);
      expect(views).toEqual([]);
    });
  });

  it("se désabonne du mic et s'arrête avec stop()", () => {
    const { mic, loop, views } = setup();
    expect(mic.count()).toBe(1);
    loop.stop();
    expect(mic.count()).toBe(0);
    mic.emit(-30);
    vi.advanceTimersByTime(1000);
    expect(views).toEqual([]);
  });
});
