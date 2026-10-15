import { describe, expect, it } from "vitest";
import { createShutdown, PAUSE_WAIT_MS } from "./shutdown.usecase";

const flush = async () => {
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
};

const setup = (pauseRewards: () => Promise<void>) => {
  const steps: string[] = [];
  const timers: { ms: number; callback: () => void; isCancelled: boolean }[] = [];
  const shutdown = createShutdown({
    pauseRewards: async () => {
      steps.push("pause demandée");
      await pauseRewards();
      steps.push("pause finie");
    },
    exit: () => steps.push("exit"),
    schedule: (callback, ms) => {
      const timer = { ms, callback, isCancelled: false };
      timers.push(timer);
      return () => {
        timer.isCancelled = true;
      };
    },
    log: (line) => steps.push(`journal : ${line}`),
  });
  return { shutdown, steps, timers };
};

describe("createShutdown : l'arrêt du serveur", () => {
  it("écrit la raison, met les rewards en pause, puis quitte, dans cet ordre", async () => {
    const { shutdown, steps } = setup(async () => undefined);
    await shutdown("OBS se ferme : arrêt du serveur.");
    expect(steps).toEqual([
      "journal : OBS se ferme : arrêt du serveur.",
      "pause demandée",
      "pause finie",
      "exit",
    ]);
  });

  it("ne quitte pas avant la fin de la pause, et annule sa minuterie une fois finie", async () => {
    let finish: () => void = () => undefined;
    const { shutdown, steps, timers } = setup(() => new Promise<void>((resolve) => (finish = resolve)));
    const done = shutdown("signal");
    await flush();
    expect(steps).not.toContain("exit");
    finish();
    await done;
    expect(steps.at(-1)).toBe("exit");
    expect(timers.map(({ isCancelled }) => isCancelled)).toEqual([true]);
  });

  it("quitte au bout de 5 s même si Twitch ne répond pas à la pause", async () => {
    const { shutdown, steps, timers } = setup(() => new Promise<void>(() => undefined));
    const done = shutdown("OBS ne revient pas");
    await flush();
    expect(timers).toHaveLength(1);
    expect(timers[0]?.ms).toBe(PAUSE_WAIT_MS);
    timers[0]?.callback();
    await done;
    expect(steps.at(-1)).toBe("exit");
  });

  it("quitte quand la pause échoue, et le dit", async () => {
    const { shutdown, steps } = setup(async () => {
      throw new Error("réseau coupé");
    });
    await shutdown("signal");
    expect(steps).toContain("journal : Arrêt : rewards pas mis en pause (réseau coupé).");
    expect(steps.at(-1)).toBe("exit");
  });

  it("ne s'arrête qu'une fois : une deuxième cause ne remet rien en pause ni ne quitte deux fois", async () => {
    const { shutdown, steps } = setup(async () => undefined);
    await Promise.all([shutdown("OBS se ferme"), shutdown("signal")]);
    expect(steps.filter((step) => step === "exit")).toHaveLength(1);
    expect(steps.filter((step) => step === "pause demandée")).toHaveLength(1);
  });
});
