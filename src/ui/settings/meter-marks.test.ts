import { describe, expect, it } from "vitest";
import { toMeterMarks, toMeterPosition, toMeterTone } from "./meter-marks";

describe("toMeterPosition", () => {
  it("va de -60 dB (vide) à 0 dB (plein)", () => {
    expect(toMeterPosition(-60)).toBe(0);
    expect(toMeterPosition(0)).toBe(1);
    expect(toMeterPosition(-30)).toBeCloseTo(0.5, 9);
    expect(toMeterPosition(-15)).toBeCloseTo(0.75, 9);
  });

  it("reste vide sous -60 dB, même au silence d'OBS (-100 dB), et plein au-dessus de 0 dB", () => {
    expect(toMeterPosition(-100)).toBe(0);
    expect(toMeterPosition(5)).toBe(1);
  });
});

describe("toMeterMarks", () => {
  it("pose le seuil, le niveau doux et le niveau fort à leur position", () => {
    const marks = toMeterMarks({ threshold: -40, quietLevel: -25, loudLevel: -10 });
    expect(marks.map(({ id, level }) => [id, level])).toEqual([
      ["threshold", -40],
      ["quiet", -25],
      ["loud", -10],
    ]);
    expect(marks[0]?.position).toBeCloseTo(1 / 3, 9);
    expect(marks[2]?.position).toBeCloseTo(5 / 6, 9);
  });

  it("n'a pas de repère pour un niveau absent, ni pour un niveau doux égal au seuil", () => {
    expect(toMeterMarks({ threshold: -40 }).map(({ id }) => id)).toEqual(["threshold"]);
    expect(toMeterMarks({ threshold: -40, quietLevel: -40, loudLevel: -10 }).map(({ id }) => id)).toEqual([
      "threshold",
      "loud",
    ]);
  });
});

describe("toMeterTone", () => {
  const levels = { threshold: -40, loudLevel: -10 };

  it("est silencieuse jusqu'au seuil compris : la tête se tait", () => {
    expect(toMeterTone(-100, levels)).toBe("silent");
    expect(toMeterTone(-40, levels)).toBe("silent");
  });

  it("parle au-dessus du seuil, et passe en fort à partir du niveau fort", () => {
    expect(toMeterTone(-39, levels)).toBe("talking");
    expect(toMeterTone(-11, levels)).toBe("talking");
    expect(toMeterTone(-10, levels)).toBe("loud");
    expect(toMeterTone(-3, levels)).toBe("loud");
  });

  it("ne passe jamais en fort sans niveau fort", () => {
    expect(toMeterTone(-3, { threshold: -40 })).toBe("talking");
  });
});
