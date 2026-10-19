import { describe, expect, it } from "vitest";
import { createMonitor, type MonitorShot } from "./monitor.usecase";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const SHOT: MonitorShot = { ok: true, bytes: JPEG };

// OBS à la main : chaque capture demandée attend qu'on la termine, de quoi voir ce qui est demandé et quand. Le test pose la scène et l'heure.
const setup = (scene: string | null = "Jeu") => {
  const world = { scene, now: 0 };
  const calls: string[] = [];
  const pending: { resolve: (shot: MonitorShot) => void; reject: (error: Error) => void }[] = [];
  const timers: { at: number; callback: () => void }[] = [];
  const monitor = createMonitor({
    port: {
      getImage(name) {
        calls.push(name);
        return new Promise<MonitorShot>((resolve, reject) => pending.push({ resolve, reject }));
      },
    },
    getScene: () => world.scene,
    clock: () => world.now,
    schedule(callback, ms) {
      const timer = { at: world.now + ms, callback };
      timers.push(timer);
      return () => {
        const index = timers.indexOf(timer);
        if (index >= 0) timers.splice(index, 1);
      };
    },
  });
  return {
    monitor,
    world,
    calls,
    timers,
    // Le temps passe : les minuteries échues partent, dans l'ordre, et leurs suites se règlent.
    advance: async (ms: number) => {
      world.now += ms;
      for (const timer of timers.filter(({ at }) => at <= world.now)) {
        timers.splice(timers.indexOf(timer), 1);
        timer.callback();
      }
      for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
    },
    answer: async (shot: MonitorShot) => {
      pending.shift()?.resolve(shot);
      await Promise.resolve();
    },
    fail: async (error: Error) => {
      pending.shift()?.reject(error);
      await Promise.resolve();
    },
  };
};

describe("createMonitor", () => {
  it("Quand trois téléphones demandent l'image pendant une capture en cours, le système doit demander une seule capture à OBS et la rendre aux trois", async () => {
    const { monitor, calls, answer } = setup();
    const asked = [monitor.getImage(), monitor.getImage(), monitor.getImage()];
    expect(calls).toEqual(["Jeu"]);
    await answer(SHOT);
    expect(await Promise.all(asked)).toEqual([SHOT, SHOT, SHOT]);
    expect(calls).toHaveLength(1);
  });

  it("réutilise l'image d'il y a moins de 200 ms sans redemander à OBS", async () => {
    const { monitor, world, calls, answer } = setup();
    const first = monitor.getImage();
    await answer(SHOT);
    await first;
    world.now = 199;
    expect(await monitor.getImage()).toEqual(SHOT);
    expect(calls).toHaveLength(1);
  });

  it("redemande à OBS une image prise il y a 200 ms", async () => {
    const { monitor, world, calls, answer } = setup();
    const first = monitor.getImage();
    await answer(SHOT);
    await first;
    world.now = 200;
    const second = monitor.getImage();
    expect(calls).toHaveLength(2);
    const next: MonitorShot = { ok: true, bytes: new Uint8Array([0xff, 0xd8]) };
    await answer(next);
    expect(await second).toEqual(next);
  });

  it("compte les 200 ms depuis la fin de la capture, pas depuis sa demande", async () => {
    const { monitor, world, calls, answer } = setup();
    const first = monitor.getImage();
    world.now = 150;
    await answer(SHOT);
    await first;
    world.now = 300;
    await monitor.getImage();
    expect(calls).toHaveLength(1);
  });

  it("refuse sans rien demander à OBS quand il ne dit pas quelle scène est à l'antenne", async () => {
    const { monitor, calls } = setup(null);
    expect(await monitor.getImage()).toEqual({
      ok: false,
      reason: "OBS ne dit pas quelle scène est à l'antenne",
    });
    expect(calls).toEqual([]);
  });

  it("refuse même avec une image récente quand la scène n'est plus connue", async () => {
    const { monitor, world, calls, answer } = setup();
    const first = monitor.getImage();
    await answer(SHOT);
    await first;
    world.scene = null;
    expect(await monitor.getImage()).toMatchObject({ ok: false });
    expect(calls).toHaveLength(1);
  });

  it("capture la scène que la régie donne au moment de la demande", async () => {
    const { monitor, world, calls, answer } = setup("Jeu");
    const first = monitor.getImage();
    await answer(SHOT);
    await first;
    world.scene = "Pause";
    world.now = 500;
    const second = monitor.getImage();
    await answer(SHOT);
    await second;
    expect(calls).toEqual(["Jeu", "Pause"]);
  });

  it("rend le refus d'OBS tel quel, le réutilise 200 ms, puis redemande", async () => {
    const { monitor, world, calls, answer } = setup();
    const refusal: MonitorShot = { ok: false, reason: "OBS refuse la capture" };
    const first = monitor.getImage();
    await answer(refusal);
    expect(await first).toEqual(refusal);
    world.now = 100;
    expect(await monitor.getImage()).toEqual(refusal);
    expect(calls).toHaveLength(1);
    world.now = 200;
    const retried = monitor.getImage();
    expect(calls).toHaveLength(2);
    await answer(SHOT);
    expect(await retried).toEqual(SHOT);
  });

  it("transforme un port qui lève en refus, le réutilise 200 ms, puis le retente", async () => {
    const { monitor, world, calls, answer, fail } = setup();
    const first = monitor.getImage();
    await fail(new Error("socket fermé"));
    expect(await first).toEqual({ ok: false, reason: "socket fermé" });
    world.now = 100;
    expect(await monitor.getImage()).toEqual({ ok: false, reason: "socket fermé" });
    expect(calls).toHaveLength(1);
    world.now = 200;
    const retried = monitor.getImage();
    expect(calls).toHaveLength(2);
    await answer(SHOT);
    expect(await retried).toEqual(SHOT);
  });

  it("garde une seule capture en vol même quand elle échoue : tous les demandeurs ont le refus", async () => {
    const { monitor, calls, fail } = setup();
    const asked = [monitor.getImage(), monitor.getImage()];
    await fail(new Error("socket fermé"));
    expect(await Promise.all(asked)).toEqual([
      { ok: false, reason: "socket fermé" },
      { ok: false, reason: "socket fermé" },
    ]);
    expect(calls).toHaveLength(1);
  });

  it("Quand OBS ne répond jamais à une capture, le système doit refuser au bout de 3 s, puis redemander une capture à la demande suivante", async () => {
    const { monitor, calls, advance } = setup();
    let refusal: MonitorShot | undefined;
    void monitor.getImage().then((shot) => {
      refusal = shot;
    });
    await advance(2999);
    expect(refusal).toBeUndefined();
    await advance(1);
    expect(refusal).toEqual({ ok: false, reason: "OBS ne rend pas l'image à temps" });
    expect(calls).toHaveLength(1);
    await advance(200);
    void monitor.getImage();
    expect(calls).toHaveLength(2);
  });

  it("rend le même refus aux trois téléphones qui attendaient la capture que personne n'a vue venir", async () => {
    const { monitor, calls, advance } = setup();
    const answers: MonitorShot[] = [];
    for (let phone = 0; phone < 3; phone += 1) {
      void monitor.getImage().then((shot) => answers.push(shot));
    }
    await advance(3000);
    const refusal = { ok: false, reason: "OBS ne rend pas l'image à temps" };
    expect(answers).toEqual([refusal, refusal, refusal]);
    expect(calls).toHaveLength(1);
  });

  it("réutilise le refus des 3 s pendant 200 ms, comme tout résultat", async () => {
    const { monitor, calls, advance } = setup();
    void monitor.getImage();
    await advance(3000);
    await advance(199);
    const answers: MonitorShot[] = [];
    void monitor.getImage().then((shot) => answers.push(shot));
    await advance(0);
    expect(answers).toEqual([{ ok: false, reason: "OBS ne rend pas l'image à temps" }]);
    expect(calls).toHaveLength(1);
  });

  it("ignore la réponse tardive d'une capture abandonnée : la suivante garde la sienne", async () => {
    const { monitor, calls, advance, answer } = setup();
    void monitor.getImage();
    await advance(3000);
    await advance(200);
    const second = monitor.getImage();
    expect(calls).toHaveLength(2);
    await answer({ ok: true, bytes: new Uint8Array([1]) });
    await answer(SHOT);
    expect(await second).toEqual(SHOT);
  });

  it("ne laisse aucune minuterie derrière une capture qui répond à temps", async () => {
    const { monitor, timers, advance, answer } = setup();
    const first = monitor.getImage();
    expect(timers).toHaveLength(1);
    await advance(100);
    await answer(SHOT);
    expect(await first).toEqual(SHOT);
    expect(timers).toHaveLength(0);
  });
});
