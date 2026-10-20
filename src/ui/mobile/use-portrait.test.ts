import { afterEach, describe, expect, it, vi } from "vitest";
import { watchPortrait } from "./use-portrait";

// La requête d'orientation du navigateur : elle garde ses écouteurs et laisse le test tourner le téléphone.
const stubMedia = () => {
  const listeners = new Set<() => void>();
  const queries: string[] = [];
  vi.stubGlobal("window", {
    matchMedia: (query: string) => {
      queries.push(query);
      return {
        addEventListener: (_type: "change", listener: () => void) => listeners.add(listener),
        removeEventListener: (_type: "change", listener: () => void) => listeners.delete(listener),
      };
    },
  });
  const rotate = (): void => {
    for (const listener of listeners) listener();
  };
  return { listeners, queries, rotate };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("watchPortrait", () => {
  it("Quand le téléphone tourne, le système doit appeler l'écouteur, sur la requête d'orientation portrait", () => {
    const { queries, rotate } = stubMedia();
    const listener = vi.fn();
    watchPortrait(listener);
    expect(queries).toEqual(["(orientation: portrait)"]);
    rotate();
    rotate();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("n'appelle plus l'écouteur une fois arrêté", () => {
    const { listeners, rotate } = stubMedia();
    const listener = vi.fn();
    const stop = watchPortrait(listener);
    stop();
    rotate();
    expect(listener).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });
});
