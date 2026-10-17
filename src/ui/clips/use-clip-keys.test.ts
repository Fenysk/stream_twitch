import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toHandledKey } from "./use-clip-keys";

// Un faux élément du DOM : il se dit des sélecteurs qu'il porte (une balise, un attribut) et répond à `closest` comme le navigateur le fait
// pour une liste de sélecteurs séparés par des virgules.
class FakeElement extends EventTarget {
  constructor(private readonly selectors: readonly string[]) {
    super();
  }

  closest(selector: string): FakeElement | null {
    return selector.split(", ").some((part) => this.selectors.includes(part)) ? this : null;
  }
}

beforeEach(() => {
  vi.stubGlobal("Element", FakeElement);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const context = { video: { ref: { current: null } }, isEnabled: true, isTrimLocked: false };

const press = (key: string, target: EventTarget | null = null, extra: { ctrlKey?: boolean } = {}) =>
  toHandledKey(
    { key, ctrlKey: false, metaKey: false, altKey: false, defaultPrevented: false, target, ...extra },
    context,
  );

// Un bloc de rire est un bouton qui porte [data-laugh-block].
const laughBlock = new FakeElement(["button", "[data-laugh-block]"]);
const button = new FakeElement(["button"]);
const handle = new FakeElement(["button", "[role='slider']"]);
const field = new FakeElement(["input"]);

describe("toHandledKey : hors d'un champ", () => {
  it("traite I, O, R, Suppr, Espace et les flèches quand rien n'a le focus", () => {
    expect(press("i")).toBe("start");
    expect(press("o")).toBe("end");
    expect(press("r")).toBe("laugh");
    expect(press("Delete")).toBe("delete");
    expect(press(" ")).toBe("toggle");
    expect(press("ArrowLeft")).toBe("back");
    expect(press("ArrowRight")).toBe("forward");
  });

  it("laisse les autres touches au navigateur, et tout raccourci avec Ctrl", () => {
    expect(press("a")).toBeUndefined();
    expect(press("r", null, { ctrlKey: true })).toBeUndefined();
  });

  it("ne traite plus rien pendant qu'un clip est traité", () => {
    expect(
      toHandledKey(
        { key: "r", ctrlKey: false, metaKey: false, altKey: false, defaultPrevented: false, target: null },
        { ...context, isEnabled: false },
      ),
    ).toBeUndefined();
  });

  it("laisse I et O quand la coupe est verrouillée, mais traite R et Suppr : les rires ne demandent aucun recodage", () => {
    const locked = { ...context, isTrimLocked: true };
    const event = { ctrlKey: false, metaKey: false, altKey: false, defaultPrevented: false, target: null };
    expect(toHandledKey({ ...event, key: "i" }, locked)).toBeUndefined();
    expect(toHandledKey({ ...event, key: "o" }, locked)).toBeUndefined();
    expect(toHandledKey({ ...event, key: "r" }, locked)).toBe("laugh");
    expect(toHandledKey({ ...event, key: "Delete" }, locked)).toBe("delete");
  });
});

describe("toHandledKey : sur un contrôle qui a ses touches", () => {
  it("se tait dans un champ de saisie, sur un bouton et sur une poignée", () => {
    for (const target of [field, button, handle]) {
      expect(press("r", target)).toBeUndefined();
      expect(press("Delete", target)).toBeUndefined();
      expect(press("ArrowLeft", target)).toBeUndefined();
    }
  });
});

describe("toHandledKey : sur un bloc de rire qui a le focus", () => {
  it("traite encore I, O, R, Espace et Suppr", () => {
    expect(press("i", laughBlock)).toBe("start");
    expect(press("o", laughBlock)).toBe("end");
    expect(press("r", laughBlock)).toBe("laugh");
    expect(press(" ", laughBlock)).toBe("toggle");
    expect(press("Delete", laughBlock)).toBe("delete");
  });

  it("laisse les flèches au bloc, qui se déplace d'une image", () => {
    expect(press("ArrowLeft", laughBlock)).toBeUndefined();
    expect(press("ArrowRight", laughBlock)).toBeUndefined();
  });
});
