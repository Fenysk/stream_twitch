import { describe, expect, it } from "vitest";
import type { RewardChoice, SoundSummary } from "../../domain/sound.schema";
import { type Draft, isReady, toDraft, toInput } from "./sound-form-input";

const choices: RewardChoice[] = [
  { id: "clash", title: "Clasher Fenysk", cost: 500, pace: 60, isManageable: false },
  { id: "wake", title: "Réveiller Jean-Renard", cost: 100, pace: 0, isManageable: false },
];

const sound: SoundSummary = {
  id: "rire0001",
  title: "Rire",
  cost: 250,
  pace: 45,
  fader: 35,
  version: "1.10",
  hasReward: true,
  isManaged: true,
};

const draft = (overrides: Partial<Draft> = {}): Draft => ({ ...toDraft(null), ...overrides });
const file = { name: "rire.wav", base64: "AAAA" };

describe("toDraft : le départ du formulaire", () => {
  it("propose 100 points, 30 s et 80 % pour un son neuf, avec une récompense neuve", () => {
    expect(toDraft(null)).toEqual({
      source: "new",
      rewardId: null,
      title: "",
      cost: 100,
      pace: 30,
      fader: 80,
      file: null,
    });
  });

  it("reprend les réglages du son qu'on modifie, sans fichier : on garde l'ancien", () => {
    expect(toDraft(sound)).toMatchObject({ title: "Rire", cost: 250, pace: 45, fader: 35, file: null });
  });
});

describe("toInput : ce que le formulaire envoie", () => {
  it("envoie les réglages saisis d'une récompense neuve, avec le fichier s'il y en a un", () => {
    expect(toInput(draft({ title: "Rire", file }), null)).toEqual({
      ok: true,
      input: { title: "Rire", cost: 100, pace: 30, fader: 80, file: "AAAA" },
    });
    expect(toInput(draft({ title: "Rire" }), null)).toEqual({
      ok: true,
      input: { title: "Rire", cost: 100, pace: 30, fader: 80 },
    });
  });

  it("refuse un coût ou un cooldown vidé", () => {
    expect(toInput(draft({ cost: null }), null)).toEqual({
      ok: false,
      message: "le coût et le cooldown doivent être des nombres",
    });
    expect(toInput(draft({ pace: null }), null)).toMatchObject({ ok: false });
  });

  it("envoie, pour une récompense existante, le titre, le coût et le cooldown de Twitch avec son identifiant", () => {
    expect(
      toInput(draft({ source: "existing", rewardId: "clash", title: "Ignoré", file, fader: 60 }), choices),
    ).toEqual({
      ok: true,
      input: { title: "Clasher Fenysk", cost: 500, pace: 60, fader: 60, rewardId: "clash", file: "AAAA" },
    });
  });

  it("demande de choisir une récompense quand aucune n'est choisie, ou que Twitch ne l'a plus dans sa liste", () => {
    expect(toInput(draft({ source: "existing" }), choices)).toEqual({
      ok: false,
      message: "choisis une récompense de Twitch",
    });
    expect(toInput(draft({ source: "existing", rewardId: "disparu" }), choices)).toMatchObject({ ok: false });
    expect(toInput(draft({ source: "existing", rewardId: "clash" }), null)).toMatchObject({ ok: false });
  });
});

describe("isReady : le formulaire peut partir", () => {
  it("veut un titre et un fichier pour une récompense neuve, le fichier seulement à la création", () => {
    expect(isReady(draft({ title: "Rire", file }), null)).toBe(true);
    expect(isReady(draft({ title: "Rire" }), null)).toBe(false);
    expect(isReady(draft({ title: "  ", file }), null)).toBe(false);
    expect(isReady(draft({ title: "Rire" }), sound)).toBe(true);
  });

  it("veut une récompense choisie et un fichier pour une récompense existante, sans titre à saisir", () => {
    expect(isReady(draft({ source: "existing", rewardId: "clash", file }), null)).toBe(true);
    expect(isReady(draft({ source: "existing", rewardId: "clash" }), null)).toBe(false);
    expect(isReady(draft({ source: "existing", file }), null)).toBe(false);
  });
});
