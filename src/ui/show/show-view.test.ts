import { describe, expect, it } from "vitest";
import { CLOSING_BANNER, OPENING_BANNER } from "../../domain/show.rules";
import { NO_VIEW, toBanner, toFoxSpot, toShownSlot, toSlot } from "./show-view";

const NOW = Date.UTC(2026, 9, 20, 12);

describe("toFoxSpot", () => {
  it("met Jean-Renard grand à droite pour l'ouverture, le carton, la clôture et hors émission", () => {
    expect(toFoxSpot({ kind: "opening" })).toBe("beside");
    expect(toFoxSpot({ kind: "card", slot: 0, title: "A", day: "2026-10-16" })).toBe("beside");
    expect(toFoxSpot({ kind: "closing" })).toBe("beside");
    expect(toFoxSpot(NO_VIEW)).toBe("beside");
  });

  it("le met petit dans un coin pendant le clip", () => {
    expect(toFoxSpot({ kind: "clip", slot: 0, title: "A" })).toBe("corner");
  });
});

describe("toBanner", () => {
  it("porte le jour et le titre du clip dans le carton", () => {
    expect(toBanner({ kind: "card", slot: 1, title: "Le saut", day: "2026-10-16" }, NOW)).toEqual({
      kicker: "16 octobre",
      title: "Le saut",
    });
  });

  it("a son propre bandeau pour l'ouverture et pour la clôture", () => {
    expect(toBanner({ kind: "opening" }, NOW)).toEqual(OPENING_BANNER);
    expect(toBanner({ kind: "closing" }, NOW)).toEqual(CLOSING_BANNER);
  });

  it("n'en a pas pendant le clip, ni hors émission", () => {
    expect(toBanner({ kind: "clip", slot: 0, title: "A" }, NOW)).toBeNull();
    expect(toBanner(NO_VIEW, NOW)).toBeNull();
  });
});

describe("toShownSlot", () => {
  it("montre la vidéo du carton (son début) puis celle du clip, et aucune autrement", () => {
    expect(toShownSlot({ kind: "card", slot: 1, title: "A", day: "2026-10-16" })).toBe(1);
    expect(toShownSlot({ kind: "clip", slot: 0, title: "A" })).toBe(0);
    expect(toShownSlot({ kind: "opening" })).toBeNull();
    expect(toShownSlot(NO_VIEW)).toBeNull();
  });
});

describe("toSlot", () => {
  it("alterne les deux emplacements d'un clip à l'autre", () => {
    expect([0, 1, 2, 3, 4].map(toSlot)).toEqual([0, 1, 0, 1, 0]);
  });
});
