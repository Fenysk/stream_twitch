import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HeadView } from "../domain/head.types";
import { toImageUrls } from "./expression-urls";
import { preloadExpression } from "./preload-images";
import { createHeadGate, type ShownHead } from "./use-head-view";

vi.mock("./preload-images", () => ({ preloadExpression: vi.fn() }));

const view = (id: string, version = "1"): HeadView => ({
  width: 10,
  height: 10,
  cut: { left: { x: 1, y: 2 }, right: { x: 3, y: 4 } },
  tilt: 1,
  opening: 1,
  scale: 1,
  closing: 0,
  topHeight: 3,
  expression: { id, version },
  idle: { angle: 0, lift: 0 },
  mouth: { kind: "closed" },
});

const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(preloadExpression).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createHeadGate : le portail des expressions de /head et de /show", () => {
  it("Quand une expression est nouvelle, le système doit montrer la vue avec ses images une fois chargées, pas avant", async () => {
    let loaded: () => void = () => undefined;
    vi.mocked(preloadExpression).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          loaded = resolve;
        }),
    );
    const shown: ShownHead[] = [];
    const gate = createHeadGate((next) => shown.push(next));
    gate.receive(view("neutre"));
    await flush();
    expect(preloadExpression).toHaveBeenCalledWith({ id: "neutre", version: "1" });
    expect(shown).toEqual([]);
    loaded();
    await flush();
    expect(shown).toEqual([{ view: view("neutre"), images: toImageUrls({ id: "neutre", version: "1" }) }]);
  });

  it("montre tout de suite les vues d'une expression déjà chargée, la bouche à chaque pas", async () => {
    vi.mocked(preloadExpression).mockResolvedValue(undefined);
    const shown: ShownHead[] = [];
    const gate = createHeadGate((next) => shown.push(next));
    gate.receive(view("neutre"));
    await flush();
    const open: HeadView = { ...view("neutre"), mouth: { kind: "open", pose: { pivot: "left", angle: 7 } } };
    gate.receive(open);
    expect(shown.map((entry) => entry.view)).toEqual([view("neutre"), open]);
    expect(preloadExpression).toHaveBeenCalledTimes(1);
  });

  it("Si les images ne se chargent pas, le système doit le dire dans la console, garder l'ancienne vue et réessayer 2 s plus tard", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(preloadExpression)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("introuvable"));
    const shown: ShownHead[] = [];
    const gate = createHeadGate((next) => shown.push(next));
    gate.receive(view("neutre"));
    await flush();
    gate.receive(view("fatigue"));
    await flush();
    expect(error).toHaveBeenCalledTimes(1);
    expect(shown.map((entry) => entry.view.expression.id)).toEqual(["neutre"]);
    vi.mocked(preloadExpression).mockResolvedValue(undefined);
    await vi.advanceTimersByTimeAsync(2000);
    expect(shown.map((entry) => entry.view.expression.id)).toEqual(["neutre", "fatigue"]);
  });
});
