import { describe, expect, it } from "vitest";
import type { Slot } from "../domain/timetable.rules";
import { createTimetable, TIMETABLE_PERIOD_MS, type TimetablePort } from "./timetable.usecase";

const at = (day: number, hours = 20): number => new Date(2026, 9, day, hours).getTime();

// Un serveur à la main : l'heure, les minuteurs, et un port dont la réponse se règle.
const setup = () => {
  const state = {
    now: at(14, 15),
    answer: [] as readonly Slot[],
    error: undefined as Error | undefined,
    calls: 0,
  };
  const port: TimetablePort = {
    async get() {
      state.calls += 1;
      if (state.error) throw state.error;
      return state.answer;
    },
  };
  const logs: string[] = [];
  const timers: { at: number; callback: () => void; isCancelled: boolean }[] = [];
  const timetable = createTimetable({
    port,
    schedule(callback, ms) {
      const timer = { at: state.now + ms, callback, isCancelled: false };
      timers.push(timer);
      return () => {
        timer.isCancelled = true;
      };
    },
    clock: () => state.now,
    log: (line) => logs.push(line),
  });
  const advance = async (ms: number) => {
    state.now += ms;
    for (const timer of timers.filter(({ at: when, isCancelled }) => when <= state.now && !isCancelled)) {
      timer.isCancelled = true;
      timer.callback();
    }
    await Promise.resolve();
    await Promise.resolve();
  };
  return { timetable, state, logs, advance, timers };
};

describe("createTimetable", () => {
  it("ne connaît rien avant la première réponse, puis rend le prochain slot", async () => {
    const { timetable, state } = setup();
    state.answer = [{ start: at(16), title: "Soirée jeux" }];
    expect(timetable.getNext()).toBeNull();
    await timetable.start();
    expect(timetable.getNext()).toEqual({ start: at(16), title: "Soirée jeux" });
  });

  it("rend le plus proche des slots à venir, et laisse tomber ceux qui sont passés", async () => {
    const { timetable, state } = setup();
    state.answer = [
      { start: at(20), title: "Loin" },
      { start: at(16), title: "Proche" },
      { start: at(10), title: "Passé" },
    ];
    await timetable.start();
    expect(timetable.getNext()?.title).toBe("Proche");
    state.now = at(17);
    expect(timetable.getNext()?.title).toBe("Loin");
  });

  it("rend null sans slot à venir : une timetable vide n'est pas une erreur", async () => {
    const { timetable, logs } = setup();
    await timetable.start();
    expect(timetable.getNext()).toBeNull();
    expect(logs).toEqual(["Planning : aucun live à venir."]);
  });

  it("écrit le prochain live au journal à la première réponse, puis seulement quand il change", async () => {
    const { timetable, state, logs, advance } = setup();
    state.answer = [{ start: at(16), title: "Soirée jeux" }];
    await timetable.start();
    expect(logs).toEqual(["Planning : Prochain live : vendredi à 20 heures. Au programme : Soirée jeux."]);
    await advance(TIMETABLE_PERIOD_MS);
    expect(logs).toHaveLength(1);
    state.answer = [{ start: at(17), title: null }];
    await advance(TIMETABLE_PERIOD_MS);
    expect(logs.at(-1)).toBe("Planning : Prochain live : samedi à 20 heures.");
  });

  it("relit la timetable toutes les 30 min, pas avant", async () => {
    const { timetable, state, advance } = setup();
    await timetable.start();
    expect(state.calls).toBe(1);
    await advance(TIMETABLE_PERIOD_MS - 1);
    expect(state.calls).toBe(1);
    await advance(1);
    expect(state.calls).toBe(2);
    await advance(TIMETABLE_PERIOD_MS);
    expect(state.calls).toBe(3);
  });

  it("ne connaît plus de slot, et le dit une fois, quand Twitch ne répond pas ; il reprend à la réponse suivante", async () => {
    const { timetable, state, logs, advance } = setup();
    state.answer = [{ start: at(16), title: null }];
    await timetable.start();
    state.error = new Error("HTTP 500");
    await advance(TIMETABLE_PERIOD_MS);
    expect(timetable.getNext()).toBeNull();
    await advance(TIMETABLE_PERIOD_MS);
    expect(logs.filter((line) => line.includes("inconnu"))).toEqual(["Planning : inconnu, HTTP 500"]);
    state.error = undefined;
    await advance(TIMETABLE_PERIOD_MS);
    expect(timetable.getNext()?.start).toBe(at(16));
    expect(logs.at(-1)).toContain("Prochain live");
  });

  it("ne relit plus rien après l'arrêt", async () => {
    const { timetable, state, advance, timers } = setup();
    await timetable.start();
    timetable.stop();
    expect(timers.filter(({ isCancelled }) => !isCancelled)).toHaveLength(0);
    await advance(10 * TIMETABLE_PERIOD_MS);
    expect(state.calls).toBe(1);
  });
});
