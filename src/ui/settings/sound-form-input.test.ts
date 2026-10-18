import { describe, expect, it } from "vitest";
import type { SoundSummary } from "../../domain/sound.schema";
import { type Draft, isReady, toDraft, toInput } from "./sound-form-input";

const sound: SoundSummary = {
  id: "rire0001",
  title: "Rire",
  fader: 35,
  version: "1.10",
  rewardTitles: ["Prout."],
  clipCount: 2,
};

const draft = (overrides: Partial<Draft> = {}): Draft => ({ ...toDraft(null), ...overrides });
const file = { name: "rire.wav", base64: "AAAA" };

describe("toDraft : le départ du formulaire", () => {
  it("propose un titre vide et 80 % pour un sound neuf, sans fichier, sans coût ni cooldown", () => {
    expect(toDraft(null)).toEqual({ title: "", fader: 80, file: null });
    expect(Object.keys(toDraft(null))).toEqual(["title", "fader", "file"]);
  });

  it("reprend les réglages du sound qu'on modifie, sans fichier : on garde l'ancien", () => {
    expect(toDraft(sound)).toEqual({ title: "Rire", fader: 35, file: null });
  });
});

describe("toInput : ce que le formulaire envoie", () => {
  it("envoie le titre et le volume saisis, avec le fichier s'il y en a un", () => {
    expect(toInput(draft({ title: "Rire", file }))).toEqual({ title: "Rire", fader: 80, file: "AAAA" });
    expect(toInput(draft({ title: "Rire" }))).toEqual({ title: "Rire", fader: 80 });
  });

  it("coupe les blancs autour du titre, comme le serveur le fera", () => {
    expect(toInput(draft({ title: "  Rire  " })).title).toBe("Rire");
  });

  it("n'envoie jamais de coût, de cooldown ni de récompense : ce sont ceux d'une récompense", () => {
    expect(Object.keys(toInput(draft({ title: "Rire", file })))).toEqual(["title", "fader", "file"]);
  });

  it("envoie le volume réglé au curseur, de 0 à 100 %", () => {
    expect(toInput(draft({ title: "Rire", fader: 0 })).fader).toBe(0);
    expect(toInput(draft({ title: "Rire", fader: 100 })).fader).toBe(100);
    expect(toInput(draft({ title: "Rire", fader: 35 }))).toEqual({ title: "Rire", fader: 35 });
  });

  it("envoie le fichier choisi en base64, et rien quand on garde l'ancien", () => {
    expect(toInput(draft({ title: "Rire", file })).file).toBe("AAAA");
    expect("file" in toInput(draft({ title: "Rire" }))).toBe(false);
    expect(toInput(toDraft(sound))).toEqual({ title: "Rire", fader: 35 });
  });
});

describe("isReady : le formulaire peut partir", () => {
  it("veut un titre et un fichier à la création", () => {
    expect(isReady(draft({ title: "Rire", file }), null)).toBe(true);
    expect(isReady(draft({ title: "Rire" }), null)).toBe(false);
    expect(isReady(draft({ title: "  ", file }), null)).toBe(false);
  });

  it("veut un titre à la modification, sans nouveau fichier : on garde l'ancien", () => {
    expect(isReady(draft({ title: "Rire" }), sound)).toBe(true);
    expect(isReady(draft({ title: "" }), sound)).toBe(false);
  });
});
