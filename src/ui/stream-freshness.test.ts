import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFreshness } from "./stream-freshness";

const STALE_MS = 15_000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// Un suivi de flux avec de fausses horloges : ce qu'il annonce (périmé ou vivant) et combien de fois il demande de rouvrir le flux.
const setup = () => {
  const changes: Array<boolean> = [];
  const silences = { count: 0 };
  const freshness = createFreshness({
    staleMs: STALE_MS,
    onChange: (isStale) => changes.push(isStale),
    onSilence: () => {
      silences.count += 1;
    },
  });
  freshness.watch();
  return { freshness, changes, silences };
};

describe("createFreshness : un flux muet devient périmé", () => {
  it("Quand le flux ne dit rien depuis 15 s, le système doit le tenir pour périmé, pas avant", () => {
    const { changes } = setup();
    vi.advanceTimersByTime(STALE_MS - 1);
    expect(changes).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(changes).toEqual([true]);
  });

  it("repart de zéro à chaque signe de vie : un message ou un battement reporte la péremption de 15 s", () => {
    const { freshness, changes } = setup();
    vi.advanceTimersByTime(10_000);
    freshness.hear();
    vi.advanceTimersByTime(STALE_MS - 1);
    expect(changes).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(changes).toEqual([true]);
  });

  it("demande de rouvrir le flux une fois périmé : une connexion qui ne répond plus ne se rouvre pas toute seule", () => {
    const { silences } = setup();
    vi.advanceTimersByTime(STALE_MS);
    expect(silences.count).toBe(1);
  });

  it("redevient vivant au premier signe de vie, une seule fois, et recompte ses 15 s", () => {
    const { freshness, changes } = setup();
    vi.advanceTimersByTime(STALE_MS);
    freshness.hear();
    freshness.hear();
    expect(changes).toEqual([true, false]);
    vi.advanceTimersByTime(STALE_MS);
    expect(changes).toEqual([true, false, true]);
  });

  it("tient le flux pour périmé tout de suite sur une erreur, sans demander de rouvrir (l'erreur s'en charge)", () => {
    const { freshness, changes, silences } = setup();
    freshness.lose();
    expect(changes).toEqual([true]);
    vi.advanceTimersByTime(STALE_MS * 2);
    expect(changes).toEqual([true]);
    expect(silences.count).toBe(0);
  });

  it("ne répète pas « périmé » quand il l'est déjà, et recompte 15 s depuis la réouverture du flux", () => {
    const { freshness, changes, silences } = setup();
    freshness.lose();
    freshness.watch();
    vi.advanceTimersByTime(STALE_MS);
    expect(changes).toEqual([true]);
    expect(silences.count).toBe(1);
    freshness.watch();
    vi.advanceTimersByTime(STALE_MS);
    expect(changes).toEqual([true]);
    expect(silences.count).toBe(2);
  });

  it("Quand le suivi se ferme, le système doit ne plus rien annoncer ni garder de minuteur", () => {
    const { freshness, changes, silences } = setup();
    vi.advanceTimersByTime(5000);
    freshness.close();
    vi.advanceTimersByTime(STALE_MS * 2);
    expect(changes).toEqual([]);
    expect(silences.count).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
