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
  idle: { angle: 0, lift: 0 },
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
      idle: { angle: 0, lift: 0 },
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

  describe("pose de repos (idle)", () => {
    // random vaut 0.5 : premier intervalle 3500 ms ; depuis neutre la pose tirée est la penchée à droite.
    const idle = { idleMin: 2000, idleMax: 5000, idleAngle: 2, idleLift: 0.005 };

    it("ne change rien sans réglage de repos : la tête reste neutre, rien n'est publié", () => {
      const { views } = setup();
      vi.advanceTimersByTime(30_000);
      expect(views).toEqual([]);
    });

    it("change de pose de repos quand l'instant prévu est passé, bouche fermée, sans publier avant", () => {
      const { views } = setup(idle);
      vi.advanceTimersByTime(3520);
      expect(views).toEqual([]);
      vi.advanceTimersByTime(110);
      expect(views).toHaveLength(1);
      expect(views[0]).toMatchObject({ idle: { angle: 2, lift: 0 }, mouth: { kind: "closed" } });
    });

    it("tient chaque pose de repos jusqu'au changement suivant, toujours différent", () => {
      const { views } = setup(idle);
      vi.advanceTimersByTime(7150);
      expect(views).toHaveLength(2);
      expect(views[1]?.idle).toEqual({ angle: -2, lift: 0 });
    });

    it("revient à la pose neutre dès qu'elle parle, avec la bouche qui s'ouvre", () => {
      const { mic, views } = setup(idle);
      vi.advanceTimersByTime(3630);
      expect(views.at(-1)?.idle).toEqual({ angle: 2, lift: 0 });
      mic.emit(-30);
      vi.advanceTimersByTime(110);
      expect(views.at(-1)).toMatchObject({ idle: { angle: 0, lift: 0 }, mouth: { kind: "open" } });
    });

    it("n'anime pas le repos tant qu'elle parle", () => {
      const { mic, views } = setup(idle);
      for (let elapsed = 0; elapsed < 12_000; elapsed += 100) {
        mic.emit(-30);
        vi.advanceTimersByTime(100);
      }
      expect(views.length).toBeGreaterThan(0);
      expect(views.every((view) => view.idle.angle === 0 && view.idle.lift === 0)).toBe(true);
    });

    it("recommence un intervalle complet après la parole avant de rebouger", () => {
      const { mic, views } = setup(idle);
      mic.emit(-30);
      vi.advanceTimersByTime(440);
      expect(views.at(-1)?.mouth.kind).toBe("closed");
      const count = views.length;
      vi.advanceTimersByTime(3300);
      expect(views).toHaveLength(count);
      vi.advanceTimersByTime(330);
      expect(views).toHaveLength(count + 1);
      expect(views.at(-1)).toMatchObject({ idle: { angle: 2, lift: 0 }, mouth: { kind: "closed" } });
    });
  });

  describe("réglages changés en direct (update)", () => {
    const idle = { idleMin: 2000, idleMax: 5000, idleAngle: 2, idleLift: 0.005 };

    it("applique un nouveau threshold aussitôt : un level qui comptait ne compte plus", () => {
      const { mic, loop, views } = setup();
      loop.update({ ...settings, threshold: -20 });
      mic.emit(-35);
      vi.advanceTimersByTime(1000);
      expect(views.filter((view) => view.mouth.kind === "open")).toEqual([]);
    });

    it("applique un nouveau delay aussitôt : elle parle plus longtemps après le dernier level fort", () => {
      const { mic, loop, views } = setup();
      loop.update({ ...settings, delay: 1000 });
      mic.emit(-30);
      vi.advanceTimersByTime(660);
      expect(views.at(-1)?.mouth.kind).toBe("open");
    });

    it("applique un nouveau rythme aussitôt, sans attendre l'ancien pas", () => {
      const { mic, loop, views } = setup();
      mic.emit(-30);
      vi.advanceTimersByTime(10);
      loop.update({ ...settings, rhythm: 50 });
      const count = views.length;
      vi.advanceTimersByTime(50);
      expect(views).toHaveLength(count + 1);
      vi.advanceTimersByTime(50);
      expect(views).toHaveLength(count + 2);
    });

    it("publie aussitôt la tête avec le nouveau tilt et le nouvel opening, la bouche telle qu'elle est", () => {
      const { loop, views } = setup();
      loop.update({ ...settings, tilt: 0.5, opening: 2.5 });
      expect(loop.feed.getView()).toMatchObject({ tilt: 0.5, opening: 2.5, mouth: { kind: "closed" } });
      expect(views).toHaveLength(1);
    });

    it("garde la bouche ouverte, avec sa pose, quand les facteurs changent en pleine parole", () => {
      const { mic, loop, views } = setup();
      mic.emit(-30);
      vi.advanceTimersByTime(110);
      const before = views.at(-1)?.mouth;
      loop.update({ ...settings, opening: 2.5 });
      expect(views.at(-1)?.mouth).toEqual(before);
      expect(views.at(-1)?.opening).toBe(2.5);
    });

    it("remet la tête à sa pose de repos neutre, et repart d'un intervalle complet", () => {
      const { loop, views } = setup(idle);
      vi.advanceTimersByTime(3630);
      expect(views.at(-1)?.idle).toEqual({ angle: 2, lift: 0 });
      loop.update({ ...settings, ...idle, idleAngle: 4 });
      expect(views.at(-1)?.idle).toEqual({ angle: 0, lift: 0 });
      const count = views.length;
      vi.advanceTimersByTime(3300);
      expect(views).toHaveLength(count);
      vi.advanceTimersByTime(330);
      expect(views.at(-1)?.idle).toEqual({ angle: 4, lift: 0 });
    });

    it("arrête les changements de pose de repos quand les réglages du repos disparaissent", () => {
      const { loop, views } = setup(idle);
      loop.update(settings);
      const count = views.length;
      vi.advanceTimersByTime(30_000);
      expect(views).toHaveLength(count);
    });

    it("garde la boucle arrêtée après stop(), même si les réglages changent ensuite", () => {
      const { mic, loop, views } = setup();
      loop.stop();
      loop.update({ ...settings, rhythm: 50 });
      mic.emit(-30);
      vi.advanceTimersByTime(1000);
      expect(views.filter((view) => view.mouth.kind === "open")).toEqual([]);
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
