import { describe, expect, it } from "vitest";
import { type PhrasePick, toNextPick } from "./pick.rules";

// Hasard déterministe (mulberry32).
const seeded = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
};

const draw = (phrases: readonly string[], count: number, random: () => number): string[] => {
  const drawn: string[] = [];
  let said: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const pick = toNextPick(phrases, said, random);
    if (!pick) throw new Error("aucun tirage");
    drawn.push(pick.phrase);
    said = pick.said;
  }
  return drawn;
};

describe("toNextPick : une phrase au hasard, sans répéter avant d'avoir tout dit", () => {
  const phrases = ["a", "b", "c", "d", "e"];

  it("rend rien quand la liste est vide", () => {
    expect(toNextPick([], [], Math.random)).toBeNull();
  });

  it("dit chaque phrase une fois avant d'en redire une, quel que soit le hasard", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const drawn = draw(phrases, 5, seeded(seed));
      expect([...drawn].sort()).toEqual(phrases);
    }
  });

  it("recommence un tour une fois tout dit, et dit encore chaque phrase une fois", () => {
    const drawn = draw(phrases, 10, seeded(3));
    expect([...drawn.slice(0, 5)].sort()).toEqual(phrases);
    expect([...drawn.slice(5)].sort()).toEqual(phrases);
  });

  it("ne commence pas le tour suivant par la dernière phrase du tour d'avant", () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const drawn = draw(phrases, 6, seeded(seed));
      expect(drawn[5]).not.toBe(drawn[4]);
    }
  });

  it("tire au hasard : le hasard choisit parmi celles qui restent", () => {
    expect(toNextPick(phrases, [], () => 0)?.phrase).toBe("a");
    expect(toNextPick(phrases, [], () => 0.999999)?.phrase).toBe("e");
    expect(toNextPick(phrases, ["a", "b"], () => 0)?.phrase).toBe("c");
    expect(toNextPick(phrases, ["a", "b"], () => 0.999999)?.phrase).toBe("e");
  });

  it("garde de quoi savoir ce qui est dit : la phrase tirée s'ajoute, un nouveau tour repart d'elle seule", () => {
    const first = toNextPick(phrases, [], () => 0) as PhrasePick;
    expect(first).toEqual({ phrase: "a", said: ["a"] });
    expect(toNextPick(phrases, ["a", "b", "c", "d", "e"], () => 0)).toEqual({ phrase: "a", said: ["a"] });
    expect(toNextPick(phrases, ["a", "b", "c", "d", "e"], () => 0)?.phrase).not.toBe("e");
  });

  it("ignore les phrases dites qui ne sont plus dans la liste (elle a été modifiée)", () => {
    const pick = toNextPick(["x", "y"], ["a", "x"], () => 0);
    expect(pick).toEqual({ phrase: "y", said: ["a", "x", "y"] });
  });

  it("répète la seule phrase quand il n'y en a qu'une", () => {
    expect(toNextPick(["seule"], ["seule"], Math.random)).toEqual({ phrase: "seule", said: ["seule"] });
    expect(draw(["seule"], 3, Math.random)).toEqual(["seule", "seule", "seule"]);
  });

  it("ne sort jamais d'indice hors de la liste, même quand le hasard rend 1", () => {
    expect(toNextPick(phrases, [], () => 1)?.phrase).toBe("e");
  });
});
