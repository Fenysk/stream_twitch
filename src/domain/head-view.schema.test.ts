import { describe, expect, it } from "vitest";
import { HeadViewSchema } from "./head-view.schema";

const view = {
  width: 577,
  height: 433,
  cut: { left: { x: 240.3, y: 333.2 }, right: { x: 345.1, y: 334.2 } },
  tilt: 1,
  opening: 1.8,
  scale: 1.5,
  idle: { angle: -2, lift: 0 },
  mouth: { kind: "open", pose: { pivot: "center", angle: 3, lift: 0.11 } },
};

describe("HeadViewSchema", () => {
  it("accepte un état avec son tilt et son opening", () => {
    expect(HeadViewSchema.safeParse(view).success).toBe(true);
  });

  it("refuse un état sans tilt : la page ne peut pas deviner l'angle", () => {
    const { tilt: _tilt, ...withoutTilt } = view;
    expect(HeadViewSchema.safeParse(withoutTilt).success).toBe(false);
  });

  it("refuse un état sans scale : la page ne peut pas deviner la force de la voix", () => {
    const { scale: _scale, ...withoutScale } = view;
    expect(HeadViewSchema.safeParse(withoutScale).success).toBe(false);
    expect(HeadViewSchema.safeParse({ ...view, scale: 0 }).success).toBe(false);
  });

  it("refuse un état sans pose de repos : la page ne peut pas deviner l'inclinaison de la tête", () => {
    const { idle: _idle, ...withoutIdle } = view;
    expect(HeadViewSchema.safeParse(withoutIdle).success).toBe(false);
    expect(HeadViewSchema.safeParse({ ...view, idle: { angle: 2 } }).success).toBe(false);
  });

  it("accepte un tilt ou un opening à 0 (le curseur va jusqu'à ×0), et refuse le négatif", () => {
    expect(HeadViewSchema.safeParse({ ...view, tilt: 0, opening: 0 }).success).toBe(true);
    expect(HeadViewSchema.safeParse({ ...view, tilt: -1 }).success).toBe(false);
    expect(HeadViewSchema.safeParse({ ...view, opening: -1 }).success).toBe(false);
  });
});
