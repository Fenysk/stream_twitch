import { describe, expect, it } from "vitest";
import { CatalogueAnswerSchema, InspectorRequestSchema } from "./deck.schema";

describe("InspectorRequestSchema", () => {
  it("accepte la demande du catalogue, et rien d'autre", () => {
    expect(InspectorRequestSchema.safeParse({ type: "catalogue" }).success).toBe(true);
    expect(InspectorRequestSchema.safeParse({ type: "settings" }).success).toBe(false);
    expect(InspectorRequestSchema.safeParse("catalogue").success).toBe(false);
  });
});

describe("CatalogueAnswerSchema", () => {
  it("accepte le catalogue lu, avec une valeur par réglage et la liste des expressions", () => {
    const answer = {
      status: "ready",
      values: { foxShouldThank: true, chatTextSize: 20, chatStyle: "pill" },
      expressions: [{ id: "photo", name: "Photo", version: "1", isBuiltIn: true }],
    };
    expect(CatalogueAnswerSchema.parse(answer)).toEqual(answer);
  });

  it("accepte de dire que le serveur est éteint ou à relancer", () => {
    expect(CatalogueAnswerSchema.safeParse({ status: "down" }).success).toBe(true);
    expect(CatalogueAnswerSchema.safeParse({ status: "to-restart" }).success).toBe(true);
  });

  it("refuse un état inconnu, une valeur qui n'est ni vrai ou faux, ni un nombre, ni un texte", () => {
    expect(CatalogueAnswerSchema.safeParse({ status: "loading" }).success).toBe(false);
    expect(
      CatalogueAnswerSchema.safeParse({ status: "ready", values: { foxShouldThank: [] }, expressions: [] })
        .success,
    ).toBe(false);
  });
});
