import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import { ViewersStateSchema } from "./viewers.schema";
import type { ViewersState } from "./viewers.types";

describe("ViewersStateSchema", () => {
  it("a exactement les cas de ViewersState : le schéma ne peut pas diverger du type", () => {
    expectTypeOf<z.infer<typeof ViewersStateSchema>>().toEqualTypeOf<ViewersState>();
  });

  it("accepte un live avec son nombre, zéro compris", () => {
    expect(ViewersStateSchema.parse({ kind: "live", count: 3 })).toEqual({ kind: "live", count: 3 });
    expect(ViewersStateSchema.parse({ kind: "live", count: 0 })).toEqual({ kind: "live", count: 0 });
  });

  it("lit un live en cours, zéro viewer compris", () => {
    expect(ViewersStateSchema.parse({ kind: "live", count: 12 })).toEqual({ kind: "live", count: 12 });
    expect(ViewersStateSchema.parse({ kind: "live", count: 0 })).toEqual({ kind: "live", count: 0 });
  });

  it("accepte hors ligne et inconnu", () => {
    expect(ViewersStateSchema.parse({ kind: "offline" })).toEqual({ kind: "offline" });
    expect(ViewersStateSchema.parse({ kind: "unknown" })).toEqual({ kind: "unknown" });
  });

  it("lit un live hors ligne, et un nombre inconnu", () => {
    expect(ViewersStateSchema.parse({ kind: "offline" })).toEqual({ kind: "offline" });
    expect(ViewersStateSchema.parse({ kind: "unknown" })).toEqual({ kind: "unknown" });
  });

  it("refuse un nombre négatif ou décimal : un nombre de viewers est un entier d'au moins zéro", () => {
    expect(ViewersStateSchema.safeParse({ kind: "live", count: -1 }).success).toBe(false);
    expect(ViewersStateSchema.safeParse({ kind: "live", count: 1.5 }).success).toBe(false);
  });

  it("refuse un nombre qui n'est pas un nombre", () => {
    expect(ViewersStateSchema.safeParse({ kind: "live", count: "3" }).success).toBe(false);
    expect(ViewersStateSchema.safeParse({ kind: "live", count: null }).success).toBe(false);
  });

  it("refuse un live sans nombre : la touche ne peut pas deviner le zéro", () => {
    expect(ViewersStateSchema.safeParse({ kind: "live" }).success).toBe(false);
  });

  it("refuse un live sans nombre, ou avec un nombre négatif, décimal ou qui n'en est pas un", () => {
    for (const count of [undefined, -1, 1.5, "12", null, Number.NaN]) {
      expect(ViewersStateSchema.safeParse({ kind: "live", count }).success).toBe(false);
    }
  });

  it("refuse un kind inconnu ou absent", () => {
    expect(ViewersStateSchema.safeParse({ kind: "paused" }).success).toBe(false);
    expect(ViewersStateSchema.safeParse({ count: 3 }).success).toBe(false);
  });

  it("refuse un état inconnu ou une réponse qui n'est pas un état", () => {
    for (const body of [{ kind: "paused" }, { count: 3 }, "live", null, []]) {
      expect(ViewersStateSchema.safeParse(body).success).toBe(false);
    }
  });

  it("refuse ce qui n'est pas un objet", () => {
    expect(ViewersStateSchema.safeParse(null).success).toBe(false);
    expect(ViewersStateSchema.safeParse("live").success).toBe(false);
    expect(ViewersStateSchema.safeParse(3).success).toBe(false);
  });
});
