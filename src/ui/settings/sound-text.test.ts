import { describe, expect, it } from "vitest";
import { toDeletionText, toUsageText } from "./sound-text";

describe("toUsageText : qui utilise un sound", () => {
  it("dit « Pas utilisé » quand ni récompense ni clip ne l'utilise", () => {
    expect(toUsageText({ rewardTitles: [], clipCount: 0 })).toBe("Pas utilisé");
  });

  it("dit les récompenses qui le jouent, entre guillemets français", () => {
    expect(toUsageText({ rewardTitles: ["Prout."], clipCount: 0 })).toBe("Joué par « Prout. »");
    expect(toUsageText({ rewardTitles: ["Applaudir", "Prout."], clipCount: 0 })).toBe(
      "Joué par « Applaudir », « Prout. »",
    );
  });

  it("dit le nombre de clips qui l'ont en rire, au pluriel seulement à partir de deux", () => {
    expect(toUsageText({ rewardTitles: [], clipCount: 1 })).toBe("Rires de 1 clip");
    expect(toUsageText({ rewardTitles: [], clipCount: 3 })).toBe("Rires de 3 clips");
  });

  it("réunit les deux sur une ligne", () => {
    expect(toUsageText({ rewardTitles: ["Prout."], clipCount: 3 })).toBe(
      "Joué par « Prout. » · Rires de 3 clips",
    );
  });

  it("n'invente pas le nombre de clips quand le dossier des clips est illisible", () => {
    expect(toUsageText({ rewardTitles: [], clipCount: null })).toBe(
      "Rires des clips non comptés (dossier des clips illisible)",
    );
    expect(toUsageText({ rewardTitles: ["Prout."], clipCount: null })).toBe("Joué par « Prout. »");
  });
});

describe("toDeletionText : ce que la confirmation redit", () => {
  it("ne dit rien d'un sound que personne n'utilise, ou dont on ne sait pas les clips", () => {
    expect(toDeletionText({ rewardTitles: [], clipCount: 0 })).toBeNull();
    expect(toDeletionText({ rewardTitles: [], clipCount: null })).toBeNull();
  });

  it("redit la récompense et les clips qui n'auront plus ce sound", () => {
    expect(toDeletionText({ rewardTitles: ["Prout."], clipCount: 3 })).toBe(
      "Utilisé par « Prout. » et 3 clips : ils n'auront plus ce son.",
    );
  });

  it("accorde le verbe : un seul utilisateur au singulier, plusieurs au pluriel", () => {
    expect(toDeletionText({ rewardTitles: ["Prout."], clipCount: 0 })).toBe(
      "Utilisé par « Prout. » : il n'aura plus ce son.",
    );
    expect(toDeletionText({ rewardTitles: [], clipCount: 1 })).toBe(
      "Utilisé par 1 clip : il n'aura plus ce son.",
    );
    expect(toDeletionText({ rewardTitles: ["A", "B"], clipCount: 0 })).toBe(
      "Utilisé par « A » et « B » : ils n'auront plus ce son.",
    );
  });

  it("sépare trois utilisateurs par des virgules, avec « et » devant le dernier", () => {
    expect(toDeletionText({ rewardTitles: ["A", "B"], clipCount: 2 })).toBe(
      "Utilisé par « A », « B » et 2 clips : ils n'auront plus ce son.",
    );
  });

  it("redit les récompenses seules quand le nombre de clips est inconnu", () => {
    expect(toDeletionText({ rewardTitles: ["Prout."], clipCount: null })).toBe(
      "Utilisé par « Prout. » : il n'aura plus ce son.",
    );
  });
});
