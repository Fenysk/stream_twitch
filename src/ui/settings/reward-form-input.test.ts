import { describe, expect, it } from "vitest";
import type { RewardSummary } from "../../domain/reward.schema";
import { type Draft, isReady, toDraft, toInput } from "./reward-form-input";

const reward: RewardSummary = {
  id: "mien",
  title: "Rire",
  cost: 250,
  pace: 45,
  isManaged: true,
  isMissing: false,
  sound: "rire0001",
};

const draft = (overrides: Partial<Draft> = {}): Draft => ({ ...toDraft(null), ...overrides });

describe("toDraft : le départ du formulaire", () => {
  it("propose 100 points et 30 s pour une récompense neuve, sans titre ni sound", () => {
    expect(toDraft(null)).toEqual({ title: "", cost: 100, pace: 30, sound: null });
  });

  it("reprend le titre, le coût et le cooldown de la récompense qu'on modifie, sans choisir de sound ici", () => {
    expect(toDraft(reward)).toEqual({ title: "Rire", cost: 250, pace: 45, sound: null });
  });
});

describe("toInput : ce que le formulaire envoie", () => {
  it("envoie le titre, le coût, le cooldown et le sound choisi", () => {
    expect(toInput(draft({ title: "Rire", sound: "rire0001" }))).toEqual({
      ok: true,
      input: { title: "Rire", cost: 100, pace: 30, sound: "rire0001" },
    });
    expect(toInput(draft({ title: "Rire" }))).toEqual({
      ok: true,
      input: { title: "Rire", cost: 100, pace: 30, sound: null },
    });
  });

  it("coupe les blancs autour du titre, comme le serveur le fera", () => {
    expect(toInput(draft({ title: "  Rire  " }))).toMatchObject({ ok: true, input: { title: "Rire" } });
  });

  it("refuse un coût ou un cooldown vidé", () => {
    expect(toInput(draft({ title: "Rire", cost: null }))).toEqual({
      ok: false,
      message: "le coût et le cooldown doivent être des nombres",
    });
    expect(toInput(draft({ title: "Rire", pace: null }))).toMatchObject({ ok: false });
  });

  it("accepte un cooldown de 0 : aucun cooldown", () => {
    expect(toInput(draft({ title: "Rire", pace: 0 }))).toMatchObject({ ok: true, input: { pace: 0 } });
  });
});

describe("isReady : le formulaire peut partir", () => {
  it("veut un titre, rien d'autre : le coût et le cooldown ont leurs valeurs par défaut", () => {
    expect(isReady(draft({ title: "Rire" }))).toBe(true);
    expect(isReady(draft({ title: "   " }))).toBe(false);
    expect(isReady(draft())).toBe(false);
  });
});
