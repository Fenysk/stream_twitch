import { describe, expect, it } from "vitest";
import { ViewersStateSchema } from "./viewers.schema";

describe("l'état des viewers lu sur /api/twitch/viewers", () => {
  it("lit un live en cours, zéro viewer compris", () => {
    expect(ViewersStateSchema.parse({ kind: "live", count: 12 })).toEqual({ kind: "live", count: 12 });
    expect(ViewersStateSchema.parse({ kind: "live", count: 0 })).toEqual({ kind: "live", count: 0 });
  });

  it("lit un live hors ligne, et un nombre inconnu", () => {
    expect(ViewersStateSchema.parse({ kind: "offline" })).toEqual({ kind: "offline" });
    expect(ViewersStateSchema.parse({ kind: "unknown" })).toEqual({ kind: "unknown" });
  });

  it("refuse un live sans nombre, ou avec un nombre négatif, décimal ou qui n'en est pas un", () => {
    for (const count of [undefined, -1, 1.5, "12", null, Number.NaN]) {
      expect(ViewersStateSchema.safeParse({ kind: "live", count }).success).toBe(false);
    }
  });

  it("refuse un état inconnu ou une réponse qui n'est pas un état", () => {
    for (const body of [{ kind: "paused" }, { count: 3 }, "live", null, []]) {
      expect(ViewersStateSchema.safeParse(body).success).toBe(false);
    }
  });
});
