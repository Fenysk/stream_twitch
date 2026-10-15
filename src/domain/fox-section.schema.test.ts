import { describe, expect, it } from "vitest";
import { FOX_SECTION_IDS, FoxSearchSchema } from "./fox-section.schema";

describe("le sous-onglet de /settings/fox", () => {
  it("compte cinq sous-onglets, la voix d'abord", () => {
    expect(FOX_SECTION_IDS).toEqual(["voice", "body", "listening", "events", "reactions"]);
  });

  it("se lit dans ?section=, pour chacun des cinq", () => {
    for (const section of FOX_SECTION_IDS) expect(FoxSearchSchema.parse({ section })).toEqual({ section });
  });

  it("tombe sur la voix quand section est absent", () => {
    expect(FoxSearchSchema.parse({})).toEqual({ section: "voice" });
  });

  it("tombe sur la voix quand section est inconnue, vide ou n'est pas un texte", () => {
    for (const section of ["inconnu", "", "VOICE", 3, null, ["body"], { id: "body" }]) {
      expect(FoxSearchSchema.parse({ section })).toEqual({ section: "voice" });
    }
  });

  it("ne garde que section : les autres paramètres de l'adresse sont ignorés", () => {
    expect(FoxSearchSchema.parse({ section: "events", debug: "1" })).toEqual({ section: "events" });
  });
});
