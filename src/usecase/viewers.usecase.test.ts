import { describe, expect, it } from "vitest";
import { createViewers, VIEWERS_PERIOD_MS, type ViewersPort } from "./viewers.usecase";

// Twitch à la main : la réponse suivante est celle que le test a posée.
const setup = (first: number | null | Error) => {
  const state: { next: number | null | Error } = { next: first };
  const timers: { ms: number; callback: () => void; isCancelled: boolean }[] = [];
  const logs: string[] = [];
  const port: ViewersPort = {
    async get() {
      if (state.next instanceof Error) throw state.next;
      return state.next;
    },
  };
  const viewers = createViewers({
    port,
    schedule: (callback, ms) => {
      const timer = { ms, callback, isCancelled: false };
      timers.push(timer);
      return () => {
        timer.isCancelled = true;
      };
    },
    log: (line) => logs.push(line),
  });
  const pending = () => timers.filter(({ isCancelled }) => !isCancelled);
  const runNext = async () => {
    const timer = pending()[0];
    if (!timer) throw new Error("rien de programmé");
    timer.isCancelled = true;
    timer.callback();
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  };
  return { viewers, state, logs, pending, runNext };
};

describe("createViewers : le nombre de viewers du live", () => {
  it("ne sait rien avant la première réponse", () => {
    expect(setup(12).viewers.getCount()).toBeNull();
  });

  it("connaît le nombre dès la première réponse", async () => {
    const { viewers } = setup(12);
    await viewers.start();
    expect(viewers.getCount()).toBe(12);
  });

  it("redemande toutes les 60 s", async () => {
    const { viewers, state, pending, runNext } = setup(12);
    await viewers.start();
    expect(pending()).toHaveLength(1);
    expect(pending()[0]?.ms).toBe(VIEWERS_PERIOD_MS);
    expect(VIEWERS_PERIOD_MS).toBe(60_000);
    state.next = 40;
    await runNext();
    expect(viewers.getCount()).toBe(40);
    expect(pending()).toHaveLength(1);
  });

  it("ne sait pas le nombre quand le live est hors ligne, et ne dit jamais zéro", async () => {
    const offline = setup(null);
    await offline.viewers.start();
    expect(offline.viewers.getCount()).toBeNull();
    const zero = setup(0);
    await zero.viewers.start();
    expect(zero.viewers.getCount()).toBeNull();
  });

  it("oublie le nombre quand le live passe hors ligne", async () => {
    const { viewers, state, runNext } = setup(12);
    await viewers.start();
    state.next = null;
    await runNext();
    expect(viewers.getCount()).toBeNull();
  });

  it("ne sait pas le nombre quand Twitch ne répond pas, le dit une fois, et le retrouve au retour de Twitch", async () => {
    const { viewers, state, logs, runNext } = setup(new Error("HTTP 503"));
    await viewers.start();
    expect(viewers.getCount()).toBeNull();
    await runNext();
    await runNext();
    expect(logs).toEqual(["Viewers : nombre inconnu, HTTP 503"]);
    state.next = 25;
    await runNext();
    expect(viewers.getCount()).toBe(25);
    expect(logs.at(-1)).toBe("Viewers : 25 en ce moment.");
  });

  it("n'écrit dans le journal que ce qui change : le nombre connu, puis le live hors ligne", async () => {
    const { viewers, state, logs, runNext } = setup(12);
    await viewers.start();
    state.next = 13;
    await runNext();
    state.next = null;
    await runNext();
    expect(logs).toEqual(["Viewers : 12 en ce moment.", "Viewers : live hors ligne, nombre inconnu."]);
  });

  it("écrit toujours la première réponse, même un live hors ligne : de quoi voir que la demande marche", async () => {
    const offline = setup(null);
    await offline.viewers.start();
    expect(offline.logs).toEqual(["Viewers : live hors ligne, nombre inconnu."]);
    await offline.runNext();
    expect(offline.logs).toHaveLength(1);
  });

  it("s'arrête : plus rien n'est programmé", async () => {
    const { viewers, pending } = setup(12);
    await viewers.start();
    viewers.stop();
    expect(pending()).toHaveLength(0);
  });
});
