import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLastLaughFader,
  getLastLaughSound,
  updateLastLaughFader,
  updateLastLaughSound,
} from "./last-laugh-choice";

// Un faux `localStorage` : une table, ou un navigateur qui le refuse (fenêtre privée, données bloquées).
const stubStorage = (items: Record<string, string> = {}, isRefused = false) => {
  const storage = {
    getItem: (key: string) => {
      if (isRefused) throw new Error("refusé");
      return items[key] ?? null;
    },
    setItem: (key: string, value: string) => {
      if (isRefused) throw new Error("refusé");
      items[key] = value;
    },
  };
  vi.stubGlobal("window", { localStorage: storage });
  return items;
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("le dernier sound choisi", () => {
  it("rend celui que le navigateur a retenu, et rien au tout début", () => {
    stubStorage();
    expect(getLastLaughSound()).toBeNull();
    updateLastLaughSound("bbbb0002");
    expect(getLastLaughSound()).toBe("bbbb0002");
  });

  it("marche sans navigateur qui retient : rien lu, rien retenu, une trace dans la console", () => {
    stubStorage({}, true);
    expect(getLastLaughSound()).toBeNull();
    expect(() => updateLastLaughSound("bbbb0002")).not.toThrow();
    expect(console.error).toHaveBeenCalledTimes(2);
  });
});

describe("le dernier volume des rires", () => {
  it("rend celui que le navigateur a retenu, de 0 à 100", () => {
    const items = stubStorage();
    expect(getLastLaughFader()).toBeNull();
    updateLastLaughFader(35);
    expect(items["clip-last-laugh-fader"]).toBe("35");
    expect(getLastLaughFader()).toBe(35);
    updateLastLaughFader(0);
    expect(getLastLaughFader()).toBe(0);
  });

  it("ne croit pas une valeur qui n'est pas un entier de 0 à 100", () => {
    for (const stored of ["", "  ", "abc", "101", "-1", "55.5"]) {
      stubStorage({ "clip-last-laugh-fader": stored });
      expect(getLastLaughFader()).toBeNull();
    }
  });

  it("marche sans navigateur qui retient : rien lu, rien retenu, une trace dans la console", () => {
    stubStorage({}, true);
    expect(getLastLaughFader()).toBeNull();
    expect(() => updateLastLaughFader(50)).not.toThrow();
    expect(console.error).toHaveBeenCalledTimes(2);
  });
});
