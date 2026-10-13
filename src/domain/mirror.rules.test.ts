import { describe, expect, it } from "vitest";
import { FLIP_MS, MIRROR_START, toMirrorScale, toNextMirror } from "./mirror.rules";

describe("toMirrorScale : l'échelle horizontale du corps", () => {
  it("vaut 1 au départ : il regarde à gauche, vers le tchat", () => {
    expect(toMirrorScale(MIRROR_START, 0)).toBe(1);
    expect(toMirrorScale(MIRROR_START, 123_456)).toBe(1);
  });

  it("passe de 1 à -1 en 150 ms en traversant 0 à mi-chemin, quand il se tourne vers Fenysk", () => {
    const turning = toNextMirror(MIRROR_START, true, 1000);
    expect(FLIP_MS).toBe(150);
    expect(toMirrorScale(turning, 1000)).toBe(1);
    expect(toMirrorScale(turning, 1075)).toBeCloseTo(0, 10);
    expect(toMirrorScale(turning, 1150)).toBe(-1);
    expect(toMirrorScale(turning, 5000)).toBe(-1);
  });

  it("décroît sans jamais remonter pendant le retournement", () => {
    const turning = toNextMirror(MIRROR_START, true, 0);
    let previous = 2;
    for (let now = 0; now <= 200; now += 5) {
      const scale = toMirrorScale(turning, now);
      expect(scale).toBeLessThanOrEqual(previous);
      previous = scale;
    }
  });

  it("se retourne dans l'autre sens à la fin de la phrase : de -1 à 1 en 150 ms", () => {
    const facing = toNextMirror(MIRROR_START, true, 0);
    const back = toNextMirror(facing, false, 1000);
    expect(toMirrorScale(back, 1000)).toBe(-1);
    expect(toMirrorScale(back, 1075)).toBeCloseTo(0, 10);
    expect(toMirrorScale(back, 1150)).toBe(1);
  });

  it("repart de là où il en est quand le sens change en plein retournement, et la course restante est plus courte", () => {
    const turning = toNextMirror(MIRROR_START, true, 0);
    const half = toMirrorScale(turning, 75);
    const back = toNextMirror(turning, false, 75);
    expect(back.from).toBeCloseTo(half, 10);
    expect(toMirrorScale(back, 75)).toBeCloseTo(0, 10);
    expect(back.ms).toBeCloseTo(75, 10);
    expect(toMirrorScale(back, 150)).toBe(1);
  });

  it("ne change rien quand le sens demandé est déjà celui qu'il vise", () => {
    const facing = toNextMirror(MIRROR_START, true, 0);
    expect(toNextMirror(facing, true, 500)).toBe(facing);
    expect(toNextMirror(MIRROR_START, false, 500)).toBe(MIRROR_START);
  });
});
