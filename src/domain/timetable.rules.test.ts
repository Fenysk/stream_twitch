import { describe, expect, it } from "vitest";
import { type Slot, toDayText, toNextSlot, toSlotText, toSlotTitle } from "./timetable.rules";

// Un jour d'octobre 2026 (le 14 est un mercredi), à l'heure locale.
const at = (day: number, hours = 20, minutes = 0, month = 9): number =>
  new Date(2026, month, day, hours, minutes).getTime();

const NOW = at(14, 15);

describe("toSlotTitle : le titre d'un créneau", () => {
  it("garde le titre, sans espace ni ponctuation finale", () => {
    expect(toSlotTitle("Soirée jeux")).toBe("Soirée jeux");
    expect(toSlotTitle("  Soirée jeux  ")).toBe("Soirée jeux");
    expect(toSlotTitle("Soirée jeux !")).toBe("Soirée jeux");
    expect(toSlotTitle("Soirée jeux...")).toBe("Soirée jeux");
  });

  it("rend null quand il n'y a pas de titre", () => {
    expect(toSlotTitle("")).toBeNull();
    expect(toSlotTitle("   ")).toBeNull();
    expect(toSlotTitle(null)).toBeNull();
    expect(toSlotTitle(undefined)).toBeNull();
    expect(toSlotTitle(" !!! ")).toBeNull();
  });
});

describe("toNextSlot : le prochain créneau à venir", () => {
  const slots: Slot[] = [
    { start: at(20), title: "Plus tard" },
    { start: at(15), title: "Demain" },
    { start: at(10), title: "Passé" },
  ];

  it("prend le plus proche dans le futur, quel que soit l'ordre", () => {
    expect(toNextSlot(slots, NOW)?.title).toBe("Demain");
  });

  it("ignore un créneau déjà commencé, ou qui commence à l'instant même", () => {
    expect(toNextSlot([{ start: NOW, title: null }], NOW)).toBeNull();
    expect(toNextSlot([{ start: NOW - 1, title: null }], NOW)).toBeNull();
  });

  it("rend null sans créneau", () => {
    expect(toNextSlot([], NOW)).toBeNull();
  });
});

describe("toDayText : le jour du prochain live", () => {
  it("dit « aujourd'hui » pour un créneau le même jour, même tard dans la soirée", () => {
    expect(toDayText(at(14, 20), NOW)).toBe("aujourd'hui");
    expect(toDayText(at(14, 23, 59), NOW)).toBe("aujourd'hui");
  });

  it("dit « demain » pour le jour suivant, y compris après minuit", () => {
    expect(toDayText(at(15, 0, 5), NOW)).toBe("demain");
    expect(toDayText(at(15, 20), at(14, 23, 59))).toBe("demain");
  });

  it("dit le nom du jour dans les 6 jours", () => {
    expect(toDayText(at(16, 20), NOW)).toBe("vendredi");
    expect(toDayText(at(15 + 1, 20), NOW)).toBe("vendredi");
    expect(toDayText(at(17, 20), NOW)).toBe("samedi");
    expect(toDayText(at(18, 20), NOW)).toBe("dimanche");
    expect(toDayText(at(19, 20), NOW)).toBe("lundi");
    expect(toDayText(at(20, 20), NOW)).toBe("mardi");
  });

  it("dit « jeudi » pour le jeudi qui vient", () => {
    expect(toDayText(at(15, 20), at(13, 12))).toBe("jeudi");
  });

  it("dit la date au-delà de 6 jours : « le 23 octobre »", () => {
    expect(toDayText(at(21, 20), NOW)).toBe("le 21 octobre");
    expect(toDayText(at(23, 20), NOW)).toBe("le 23 octobre");
  });

  it("dit « le 1er » pour le premier du mois, et change de mois", () => {
    expect(toDayText(at(1, 20, 0, 10), NOW)).toBe("le 1er novembre");
    expect(toDayText(at(2, 20, 0, 11), NOW)).toBe("le 2 décembre");
  });
});

describe("toSlotText : la phrase du prochain live", () => {
  it("dit le jour, l'heure et le titre", () => {
    expect(toSlotText({ start: at(16, 20), title: "Soirée jeux" }, NOW)).toBe(
      "Prochain live : vendredi à 20 heures. Au programme : Soirée jeux.",
    );
  });

  it("dit l'heure avec les minutes : « 20 heures 30 »", () => {
    expect(toSlotText({ start: at(16, 20, 30), title: "Soirée jeux" }, NOW)).toBe(
      "Prochain live : vendredi à 20 heures 30. Au programme : Soirée jeux.",
    );
  });

  it("n'écrit pas « Au programme » sans titre", () => {
    expect(toSlotText({ start: at(14, 20), title: null }, NOW)).toBe(
      "Prochain live : aujourd'hui à 20 heures.",
    );
  });

  it("dit minuit pour un créneau à minuit", () => {
    expect(toSlotText({ start: at(15, 0), title: null }, NOW)).toBe("Prochain live : demain à minuit.");
  });

  it("dit la date au-delà de 6 jours", () => {
    expect(toSlotText({ start: at(23, 20), title: "Gros live" }, NOW)).toBe(
      "Prochain live : le 23 octobre à 20 heures. Au programme : Gros live.",
    );
  });
});
