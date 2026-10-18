import { afterEach, describe, expect, it, vi } from "vitest";
import type { HeadView } from "../domain/head.types";
import { toHeadListener } from "./head-listener";

const HEAD: HeadView = {
  width: 10,
  height: 10,
  cut: { left: { x: 1, y: 2 }, right: { x: 3, y: 4 } },
  tilt: 1,
  opening: 1,
  scale: 1,
  closing: 0,
  topHeight: 3,
  expression: { id: "photo", version: "1" },
  idle: { angle: 0, lift: 0 },
  mouth: { kind: "closed" },
};

const message = (data: unknown): MessageEvent<string> =>
  new MessageEvent("message", { data: JSON.stringify(data) });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("toHeadListener", () => {
  it("Quand le message porte une vue de la tête valide, le système doit la rendre telle quelle", () => {
    const views: HeadView[] = [];
    toHeadListener((view) => views.push(view))(message(HEAD));
    expect(views).toEqual([HEAD]);
  });

  it("Si le message est illisible, le système doit le dire dans la console et ne rien rendre", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const views: HeadView[] = [];
    toHeadListener((view) => views.push(view))(message({ width: -1 }));
    expect(views).toEqual([]);
    expect(error).toHaveBeenCalledTimes(1);
  });
});
