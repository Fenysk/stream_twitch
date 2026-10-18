import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HeadView } from "../domain/head.types";
import { IDLE_SHOW, SHOW_HEAD_EVENT } from "../domain/show.schema";
import { watchShowState } from "./show-api";

type Listener = (message: MessageEvent<string>) => void;

// Un faux EventSource : il garde ce que la page lui demande d'écouter, et le test lui fait « arriver » des messages.
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: Listener | null = null;
  isClosed = false;
  private readonly named = new Map<string, Listener>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(name: string, listener: Listener): void {
    this.named.set(name, listener);
  }

  close(): void {
    this.isClosed = true;
  }

  listensTo(name: string): boolean {
    return this.named.has(name);
  }

  // Un message sans nom (l'état), ou un évènement nommé (la tête).
  emit(data: unknown, name?: string): void {
    const message = new MessageEvent("message", { data: JSON.stringify(data) });
    if (name === undefined) this.onmessage?.(message);
    else this.named.get(name)?.(message);
  }
}

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

const TALKING_HEAD: HeadView = { ...HEAD, mouth: { kind: "open", pose: { pivot: "left", angle: 7 } } };

const onlySource = (): FakeEventSource => {
  const [source] = FakeEventSource.instances;
  if (!source) throw new Error("aucun EventSource ouvert");
  return source;
};

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("watchShowState : la page /show", () => {
  it("Quand la page /show suit l'émission et sa tête, le système doit ouvrir une seule connexion, celle de la page", () => {
    watchShowState(
      true,
      () => undefined,
      () => undefined,
    );
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(onlySource().url).toBe("/api/show/events?place=page");
  });

  it("rend à `onHead` la vue de la tête de chaque évènement nommé, et rien à `onState`", () => {
    const states: unknown[] = [];
    const heads: HeadView[] = [];
    watchShowState(
      true,
      (state) => states.push(state),
      (view) => heads.push(view),
    );
    onlySource().emit(HEAD, SHOW_HEAD_EVENT);
    onlySource().emit(TALKING_HEAD, SHOW_HEAD_EVENT);
    expect(heads).toEqual([HEAD, TALKING_HEAD]);
    expect(states).toEqual([]);
  });

  it("rend à `onState` l'état de chaque message sans nom, et rien à `onHead`", () => {
    const states: unknown[] = [];
    const heads: HeadView[] = [];
    watchShowState(
      true,
      (state) => states.push(state),
      (view) => heads.push(view),
    );
    onlySource().emit({ ...IDLE_SHOW, showFader: 15 });
    expect(states).toEqual([{ ...IDLE_SHOW, showFader: 15 }]);
    expect(heads).toEqual([]);
  });

  it("garde l'ordre des deux sortes de messages sur la même connexion", () => {
    const seen: string[] = [];
    watchShowState(
      true,
      (state) => seen.push(`état ${state.showFader}`),
      (view) => seen.push(`tête ${view.expression.id}`),
    );
    onlySource().emit({ ...IDLE_SHOW, showFader: 15 });
    onlySource().emit(HEAD, SHOW_HEAD_EVENT);
    onlySource().emit({ ...IDLE_SHOW, showFader: 100 });
    expect(seen).toEqual(["état 15", "tête photo", "état 100"]);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("Si la vue de la tête est illisible, le système doit le dire dans la console et ne rien rendre", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const heads: HeadView[] = [];
    watchShowState(
      true,
      () => undefined,
      (view) => heads.push(view),
    );
    onlySource().emit({ width: -1 }, SHOW_HEAD_EVENT);
    expect(heads).toEqual([]);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("ferme la connexion à la fin", () => {
    const close = watchShowState(
      true,
      () => undefined,
      () => undefined,
    );
    close();
    expect(onlySource().isClosed).toBe(true);
  });
});

describe("watchShowState : l'onglet Émission et /countdown", () => {
  it("Quand aucune vue de la tête n'est demandée, le système ne doit pas écouter l'évènement de la tête", () => {
    watchShowState(false, () => undefined);
    expect(onlySource().url).toBe("/api/show/events");
    expect(onlySource().listensTo(SHOW_HEAD_EVENT)).toBe(false);
  });

  it("rend l'état comme avant", () => {
    const states: unknown[] = [];
    watchShowState(false, (state) => states.push(state));
    onlySource().emit(IDLE_SHOW);
    expect(states).toEqual([IDLE_SHOW]);
  });
});
