import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { toInstant } from "../domain/instant.rules";
import { type LocalSettings, type Settings, SettingsSchema } from "../domain/settings.schema";
import { createFoxEndReset, END_RESET_PERIOD_MS } from "./fox-end-reset.usecase";
import { type Broadcast, type BroadcastPort, createFoxHours, type FoxHours } from "./fox-hours.usecase";
import { createSettingsStore } from "./settings.usecase";

const at = (day: number, hours: number, minutes = 0, seconds = 0): number =>
  new Date(2026, 9, day, hours, minutes, seconds).getTime();
const iso = (when: number): string => new Date(when).toISOString();

const MINUTE = 60_000;
const HOUR = 3_600_000;

// Les réglages de settings.json, avec des phrases courtes : les paliers n'ont pas lieu, la fin et ses rappels toutes les 10 min.
const defaults: Settings = {
  ...SettingsSchema.parse(JSON.parse(readFileSync(join(process.cwd(), "settings.json"), "utf8"))),
  foxHourPhrases: [],
  foxEndWarningMarks: [],
  foxEndPhrases: ["Fin."],
  foxOvertimeGap: 10 * MINUTE,
  foxOvertimePhrases: ["Rab de {retard}."],
  foxBedtimePhrases: ["Dodo."],
};

// Un serveur à la main : la vraie boîte des réglages (en mémoire), la fin remise à zéro et l'heure du live, l'horloge du PC, les
// minuteurs, la diffusion d'OBS et les pas de 100 ms. `local` : ce que settings.local.json garde au démarrage.
const setup = ({ now, local = {} }: { now: number; local?: LocalSettings }) => {
  const state = { now, tick: (): void => undefined, isDiskFailing: false };
  const written: LocalSettings[] = [];
  const logs: string[] = [];
  const texts: string[] = [];
  const timers: { at: number; callback: () => void; isCancelled: boolean }[] = [];
  const listeners = new Set<(broadcast: Broadcast) => void>();
  const broadcast: BroadcastPort = {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const schedule = (callback: () => void, ms: number) => {
    const timer = { at: state.now + ms, callback, isCancelled: false };
    timers.push(timer);
    return () => {
      timer.isCancelled = true;
    };
  };
  const wiring: { hours?: FoxHours } = {};
  const store = createSettingsStore({
    defaults,
    local,
    port: {
      updateLocal(next) {
        if (state.isDiskFailing) throw new Error("disque plein");
        written.push(next);
      },
      deleteLocal() {
        written.push({});
      },
    },
    onChange: (effective) => wiring.hours?.update(effective),
    log: (line) => logs.push(line),
  });
  const hours = createFoxHours({
    broadcast,
    queue: { push: (item) => texts.push(item.text) },
    mode: {
      subscribe(listener) {
        state.tick = listener;
        return () => undefined;
      },
      flash: () => 0,
      leave: () => undefined,
    },
    review: { sayAtEnd: () => undefined },
    settings: store.getState().effective,
    clock: () => state.now,
    random: () => 0,
    log: (line) => logs.push(line),
  });
  wiring.hours = hours;
  const endOf = (): string => store.getState().effective.foxEndAt ?? "";
  const reset = createFoxEndReset({
    broadcast,
    end: {
      get: () => toInstant(endOf()),
      reset: () => store.update({ foxEndAt: "" }).ok,
    },
    clock: () => state.now,
    schedule,
    log: (line) => logs.push(line),
  });
  // Le même ordre que le câblage du serveur : la remise à zéro voit la diffusion avant l'heure du live.
  reset.start();
  hours.start();
  const emit = (next: Broadcast) => {
    for (const listener of [...listeners]) listener(next);
  };
  // Le temps passe jusqu'à `when` : chaque minuteur dû sonne à son heure, suivi d'un pas de 100 ms.
  const goTo = (when: number) => {
    for (;;) {
      const due = timers
        .filter((timer) => !timer.isCancelled && timer.at <= when)
        .sort((first, second) => first.at - second.at)[0];
      if (!due) break;
      due.isCancelled = true;
      state.now = due.at;
      state.tick();
      due.callback();
    }
    state.now = when;
    state.tick();
  };
  return { state, store, written, logs, texts, timers, listeners, reset, emit, goTo, endOf };
};

describe("createFoxEndReset : la fin prévue s'efface quand le live est fini", () => {
  it("l'efface à l'arrêt du live quand elle est passée : live 11:43, fin 15:00, arrêt à 15:20", () => {
    const { store, written, logs, texts, emit, goTo, endOf } = setup({ now: at(14, 11, 43) });
    emit({ isLive: true, duration: 0 });
    store.update({ foxEndAt: iso(at(14, 15)) });
    goTo(at(14, 15, 20));
    expect(texts).toEqual(["Fin.", "Rab de 10 minutes.", "Rab de 20 minutes."]);
    expect(endOf()).toBe(iso(at(14, 15)));
    emit({ isLive: false, duration: 0 });
    expect(endOf()).toBe("");
    expect(written.at(-1)).toMatchObject({ foxEndAt: "" });
    expect(logs).toContain(
      "Renard : la fin prévue de 15 h 00 est passée et le live est fini : elle est effacée.",
    );
  });

  it("la garde à l'arrêt d'un live coupé avant l'heure de fin, puis l'efface 3 h après elle : arrêt à 14:30, effacée à 18:00", () => {
    const { store, logs, emit, goTo, endOf } = setup({ now: at(14, 11, 43) });
    emit({ isLive: true, duration: 0 });
    store.update({ foxEndAt: iso(at(14, 15)) });
    goTo(at(14, 14, 30));
    emit({ isLive: false, duration: 0 });
    expect(endOf()).toBe(iso(at(14, 15)));
    goTo(at(14, 17, 59));
    expect(endOf()).toBe(iso(at(14, 15)));
    goTo(at(14, 18));
    expect(endOf()).toBe("");
    expect(logs).toContain(
      "Renard : la fin prévue de 15 h 00 est passée depuis plus de 3 h, hors live : elle est effacée.",
    );
  });

  it("l'efface au début d'un live commencé après elle (OBS fermé en plein live) : fin 15:00, live de 16:00", () => {
    const { logs, texts, emit, goTo, endOf } = setup({
      now: at(14, 16),
      local: { foxEndAt: iso(at(14, 15)) },
    });
    expect(endOf()).toBe(iso(at(14, 15)));
    emit({ isLive: true, duration: 0 });
    expect(endOf()).toBe("");
    expect(logs).toContain(
      "Renard : la fin prévue de 15 h 00 est passée avant le début du live : elle est effacée.",
    );
    goTo(at(14, 16, 30));
    expect(texts).toEqual([]);
  });

  it("l'efface aussi quand le serveur découvre un live commencé après elle", () => {
    const { emit, endOf } = setup({ now: at(14, 17), local: { foxEndAt: iso(at(14, 15)) } });
    emit({ isLive: true, duration: 30 * MINUTE });
    expect(endOf()).toBe("");
  });

  it("garde la fin d'un serveur relancé en plein live commencé avant elle, et les rappels continuent : relancé à 15:10, live de 11:43", () => {
    const { logs, texts, emit, goTo, endOf } = setup({
      now: at(14, 15, 10),
      local: { foxEndAt: iso(at(14, 15)) },
    });
    emit({ isLive: true, duration: 3 * HOUR + 27 * MINUTE });
    expect(endOf()).toBe(iso(at(14, 15)));
    expect(texts).toEqual([]);
    goTo(at(14, 15, 19));
    expect(texts).toEqual([]);
    goTo(at(14, 15, 20));
    expect(texts).toEqual(["Rab de 20 minutes."]);
    goTo(at(14, 15, 30));
    expect(texts).toEqual(["Rab de 20 minutes.", "Dodo."]);
    expect(logs.filter((line) => line.includes("effacée"))).toEqual([]);
  });

  it("ne l'efface jamais pendant un live commencé avant elle, même bien après fin + 3 h", () => {
    const { emit, goTo, endOf } = setup({ now: at(14, 15, 10), local: { foxEndAt: iso(at(14, 15)) } });
    emit({ isLive: true, duration: 3 * HOUR + 27 * MINUTE });
    goTo(at(14, 18, 10));
    expect(endOf()).toBe(iso(at(14, 15)));
    goTo(at(14, 23));
    expect(endOf()).toBe(iso(at(14, 15)));
  });

  it("n'efface rien tant qu'OBS n'a pas dit si le live est en cours, puis l'efface hors live", () => {
    const { emit, goTo, endOf } = setup({ now: at(14, 23), local: { foxEndAt: iso(at(14, 15)) } });
    expect(endOf()).toBe(iso(at(14, 15)));
    goTo(at(14, 23, 5));
    expect(endOf()).toBe(iso(at(14, 15)));
    emit({ isLive: false, duration: 0 });
    expect(endOf()).toBe("");
  });

  it("ne prend pas pour un arrêt le hors-live qu'OBS annonce à la connexion : fin 15:00, serveur relancé à 16:00 hors live", () => {
    const { emit, goTo, endOf } = setup({ now: at(14, 16), local: { foxEndAt: iso(at(14, 15)) } });
    emit({ isLive: false, duration: 0 });
    expect(endOf()).toBe(iso(at(14, 15)));
    goTo(at(14, 17, 59));
    expect(endOf()).toBe(iso(at(14, 15)));
    goTo(at(14, 18));
    expect(endOf()).toBe("");
  });

  it("garde une fin à venir hors live, et ne dit rien quand il n'y a pas de fin", () => {
    const withEnd = setup({ now: at(14, 12), local: { foxEndAt: iso(at(14, 15)) } });
    withEnd.emit({ isLive: false, duration: 0 });
    withEnd.goTo(at(14, 14, 59));
    expect(withEnd.endOf()).toBe(iso(at(14, 15)));
    const withoutEnd = setup({ now: at(14, 12) });
    withoutEnd.emit({ isLive: false, duration: 0 });
    withoutEnd.goTo(at(14, 20));
    expect(withoutEnd.written).toEqual([]);
    expect(withoutEnd.logs.filter((line) => line.includes("fin prévue"))).toEqual([]);
  });

  it("relit la fin chaque minute, depuis le démarrage", () => {
    const { state, timers } = setup({ now: at(14, 12) });
    expect(END_RESET_PERIOD_MS).toBe(60_000);
    expect(timers.filter(({ isCancelled }) => !isCancelled).map(({ at: when }) => when)).toEqual([
      state.now + MINUTE,
    ]);
  });

  it("dit quand l'écriture échoue, garde la fin, et réessaie à la minute suivante", () => {
    const { state, logs, emit, goTo, endOf } = setup({
      now: at(14, 17, 30),
      local: { foxEndAt: iso(at(14, 15)) },
    });
    emit({ isLive: false, duration: 0 });
    state.isDiskFailing = true;
    goTo(at(14, 18));
    expect(endOf()).toBe(iso(at(14, 15)));
    expect(logs).toContain(
      "Renard : la fin prévue de 15 h 00 est passée depuis plus de 3 h, hors live, mais elle n'a pas pu être effacée.",
    );
    state.isDiskFailing = false;
    goTo(at(14, 18, 1));
    expect(endOf()).toBe("");
  });

  it("ne s'abonne qu'une fois au démarrage, et se désabonne et annule son minuteur à l'arrêt", () => {
    const { reset, listeners, timers, emit, endOf } = setup({
      now: at(14, 18),
      local: { foxEndAt: iso(at(14, 15)) },
    });
    reset.start();
    expect(listeners.size).toBe(2);
    reset.stop();
    expect(listeners.size).toBe(1);
    expect(timers.filter(({ isCancelled }) => !isCancelled)).toEqual([]);
    emit({ isLive: false, duration: 0 });
    expect(endOf()).toBe(iso(at(14, 15)));
  });
});
