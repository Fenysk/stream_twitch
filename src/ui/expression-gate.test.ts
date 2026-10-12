import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HeadView } from "../domain/head.types";
import { createExpressionGate } from "./expression-gate";

const view = (id: string, version = "1", closing = 0): HeadView => ({
  width: 10,
  height: 10,
  cut: { left: { x: 1, y: 2 }, right: { x: 3, y: 4 } },
  tilt: 1,
  opening: 1,
  scale: 1,
  closing,
  topHeight: 3,
  expression: { id, version },
  idle: { angle: 0, lift: 0 },
  mouth: { kind: "closed" },
});

// Un préchargement qu'on résout à la main : le test décide quand les images arrivent.
const createPreloads = () => {
  const pending: Array<{ key: string; done: () => void; fail: (error: Error) => void }> = [];
  const preload = (expression: { id: string; version: string }) =>
    new Promise<void>((resolve, reject) => {
      pending.push({ key: `${expression.id}@${expression.version}`, done: resolve, fail: reject });
    });
  return { preload, pending };
};

const flush = () => vi.advanceTimersByTimeAsync(0);

const setup = () => {
  const { preload, pending } = createPreloads();
  const shown: HeadView[] = [];
  const errors: unknown[] = [];
  const gate = createExpressionGate({
    preload,
    show: (next) => shown.push(next),
    onError: (error) => errors.push(error),
    retryMs: 2000,
  });
  return { gate, pending, shown, errors };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createExpressionGate : la première expression", () => {
  it("ne montre rien avant que ses images soient chargées : pas de tête vide", async () => {
    const { gate, pending, shown } = setup();
    gate.receive(view("photo"));
    await flush();
    expect(shown).toEqual([]);
    pending[0]?.done();
    await flush();
    expect(shown.map(({ expression }) => expression.id)).toEqual(["photo"]);
  });
});

describe("createExpressionGate : la même expression", () => {
  it("montre chaque vue aussitôt, sans nouveau chargement", async () => {
    const { gate, pending, shown } = setup();
    gate.receive(view("photo"));
    pending[0]?.done();
    await flush();
    gate.receive(view("photo"));
    gate.receive(view("photo"));
    expect(shown).toHaveLength(3);
    expect(pending).toHaveLength(1);
  });
});

describe("createExpressionGate : une autre expression", () => {
  const withPhotoShown = async () => {
    const context = setup();
    context.gate.receive(view("photo"));
    context.pending[0]?.done();
    await flush();
    return context;
  };

  it("charge ses images d'abord : l'ancienne reste à l'écran, ses vues sont retenues", async () => {
    const { gate, pending, shown } = await withPhotoShown();
    gate.receive(view("abcd0001"));
    gate.receive(view("photo"));
    expect(pending).toHaveLength(2);
    expect(shown).toHaveLength(2);
    expect(shown.map(({ expression }) => expression.id)).toEqual(["photo", "photo"]);
  });

  it("bascule d'un coup, avec le dernier état reçu, quand les images sont là", async () => {
    const { gate, pending, shown } = await withPhotoShown();
    gate.receive(view("abcd0001", "1", 5));
    pending[1]?.done();
    await flush();
    gate.receive(view("abcd0001", "1", 9));
    expect(shown.at(-1)?.expression.id).toBe("abcd0001");
    expect(shown.at(-1)?.closing).toBe(9);
  });

  it("ne montre que le dernier état quand plusieurs vues arrivent pendant le chargement", async () => {
    const { gate, pending, shown } = await withPhotoShown();
    gate.receive(view("abcd0001", "1", 1));
    gate.receive(view("abcd0001", "1", 2));
    gate.receive(view("abcd0001", "1", 3));
    expect(pending).toHaveLength(2);
    pending[1]?.done();
    await flush();
    expect(shown.at(-1)?.closing).toBe(3);
    expect(shown.filter(({ expression }) => expression.id === "abcd0001")).toHaveLength(1);
  });

  it("traite une retouche comme une autre expression : sa nouvelle version se charge avant de s'afficher", async () => {
    const { gate, pending, shown } = await withPhotoShown();
    gate.receive(view("photo", "2"));
    expect(shown.at(-1)?.expression.version).toBe("1");
    pending[1]?.done();
    await flush();
    expect(shown.at(-1)?.expression.version).toBe("2");
  });

  it("charge ensuite la dernière expression demandée quand elle a changé pendant le chargement", async () => {
    const { gate, pending, shown } = await withPhotoShown();
    gate.receive(view("abcd0001"));
    gate.receive(view("bbbb0002"));
    pending[1]?.done();
    await flush();
    expect(pending.map(({ key }) => key)).toEqual(["photo@1", "abcd0001@1", "bbbb0002@1"]);
    expect(shown.at(-1)?.expression.id).toBe("photo");
    pending[2]?.done();
    await flush();
    expect(shown.at(-1)?.expression.id).toBe("bbbb0002");
  });

  it("revient à une expression déjà chargée sans la recharger", async () => {
    const { gate, pending, shown } = await withPhotoShown();
    gate.receive(view("abcd0001"));
    pending[1]?.done();
    await flush();
    gate.receive(view("photo"));
    expect(pending).toHaveLength(2);
    expect(shown.at(-1)?.expression.id).toBe("photo");
  });
});

describe("createExpressionGate : un chargement qui échoue", () => {
  it("garde l'ancienne expression, le dit, puis réessaie après le délai", async () => {
    const { gate, pending, shown, errors } = setup();
    gate.receive(view("photo"));
    pending[0]?.done();
    await flush();
    gate.receive(view("abcd0001"));
    pending[1]?.fail(new Error("image introuvable"));
    await flush();
    expect(errors).toHaveLength(1);
    expect(shown.at(-1)?.expression.id).toBe("photo");
    expect(pending).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(pending).toHaveLength(3);
    pending[2]?.done();
    await flush();
    expect(shown.at(-1)?.expression.id).toBe("abcd0001");
  });
});
