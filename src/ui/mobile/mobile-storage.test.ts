import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteSavedRole,
  getPhoneId,
  getSavedNumber,
  getSavedRole,
  updateSavedNumber,
  updateSavedRole,
} from "./mobile-storage";
import { createRandomId } from "./random-id";

// Un stockage de navigateur, ou un stockage qui refuse tout (navigation privée, données bloquées).
const stubStorage = (isRefusing = false) => {
  const items = new Map<string, string>();
  const refuse = () => {
    throw new Error("stockage bloqué");
  };
  vi.stubGlobal("window", {
    localStorage: {
      getItem: isRefusing ? refuse : (key: string) => items.get(key) ?? null,
      setItem: isRefusing ? refuse : (key: string, value: string) => void items.set(key, value),
      removeItem: isRefusing ? refuse : (key: string) => void items.delete(key),
    },
  });
  return items;
};

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("le rôle gardé", () => {
  it("revient tel qu'il a été choisi, et s'efface quand le téléphone en change", () => {
    stubStorage();
    expect(getSavedRole()).toBeNull();
    updateSavedRole("selfie");
    expect(getSavedRole()).toBe("selfie");
    deleteSavedRole();
    expect(getSavedRole()).toBeNull();
  });

  it("ignore un texte qui n'est pas un rôle", () => {
    const items = stubStorage();
    items.set("stream-twitch:mobile:role", "chef");
    expect(getSavedRole()).toBeNull();
  });
});

describe("le numéro de caméra gardé", () => {
  it("revient tel qu'il a été pris, et ignore un texte qui n'est pas un numéro", () => {
    const items = stubStorage();
    expect(getSavedNumber()).toBeNull();
    updateSavedNumber(3);
    expect(getSavedNumber()).toBe(3);
    items.set("stream-twitch:mobile:camera-number", "trois");
    expect(getSavedNumber()).toBeNull();
  });
});

describe("l'identifiant du téléphone", () => {
  it("est créé à la première ouverture, puis gardé", () => {
    stubStorage();
    const first = getPhoneId();
    expect(first).toMatch(/^[0-9a-f]{24}$/);
    expect(getPhoneId()).toBe(first);
  });

  it("est refait quand celui qui est gardé n'est pas un identifiant", () => {
    const items = stubStorage();
    items.set("stream-twitch:mobile:phone-id", "x");
    expect(getPhoneId()).toMatch(/^[0-9a-f]{24}$/);
  });
});

describe("un stockage qui refuse", () => {
  it("Si le stockage refuse, alors le système doit prévenir dans la console et laisser la page marcher sans", () => {
    stubStorage(true);
    expect(getSavedRole()).toBeNull();
    expect(() => updateSavedRole("camera")).not.toThrow();
    expect(() => deleteSavedRole()).not.toThrow();
    expect(getSavedNumber()).toBeNull();
    expect(getPhoneId()).toMatch(/^[0-9a-f]{24}$/);
    expect(console.warn).toHaveBeenCalled();
  });
});

describe("createRandomId", () => {
  it("rend 24 caractères hexadécimaux, différents à chaque fois", () => {
    const ids = new Set(Array.from({ length: 20 }, createRandomId));
    expect(ids.size).toBe(20);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{24}$/);
  });
});
