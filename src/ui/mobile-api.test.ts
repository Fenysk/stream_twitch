import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PHONE_KEEPALIVE_EVENT,
  PHONE_STALE_MS,
  type PhoneEvent,
  type ScreenEvent,
} from "../domain/phone.schema";
import { watchPhone, watchScreen } from "./mobile-api";

// Un faux EventSource : le test donne les messages, les battements et les erreurs, et lit ce que la page ouvre et ferme.
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((message: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  isClosed = false;
  private readonly listeners = new Map<string, () => void>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(name: string, listener: () => void): void {
    this.listeners.set(name, listener);
  }

  close(): void {
    this.isClosed = true;
  }

  say(payload: object): void {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(payload) }));
  }

  beat(): void {
    this.listeners.get(PHONE_KEEPALIVE_EVENT)?.();
  }
}

const RECONNECT_MS = 1000;
const NUMBER_EVENT = { kind: "number", number: 3 };

beforeEach(() => {
  vi.useFakeTimers();
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const lastSource = (): FakeEventSource => {
  const source = FakeEventSource.instances.at(-1);
  if (!source) throw new Error("aucun flux ouvert");
  return source;
};

const setup = () => {
  const stale: Array<boolean> = [];
  const events: PhoneEvent[] = [];
  const stop = watchPhone({
    id: "phone-0001",
    role: "control",
    getNumber: () => null,
    onEvent: (event) => events.push(event),
    onOpen: () => undefined,
    onStale: (isStale) => stale.push(isStale),
  });
  return { stale, events, stop };
};

describe("watchPhone : un flux muet devient périmé", () => {
  it("Quand le flux ne reçoit rien depuis 15 s, le système doit le dire périmé, pas avant", () => {
    const { stale } = setup();
    vi.advanceTimersByTime(PHONE_STALE_MS - 1);
    expect(stale).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(stale).toEqual([true]);
  });

  it("rouvre la connexion après ces 15 s : elle est peut-être morte sans erreur, et redevient vivante au premier message", () => {
    const { stale } = setup();
    const first = lastSource();
    vi.advanceTimersByTime(PHONE_STALE_MS);
    expect(first.isClosed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(1);
    vi.advanceTimersByTime(RECONNECT_MS);
    expect(FakeEventSource.instances).toHaveLength(2);
    lastSource().say(NUMBER_EVENT);
    expect(stale).toEqual([true, false]);
  });

  it("garde le flux vivant avec un battement keepalive toutes les 10 s, sans qu'aucun message arrive", () => {
    const { stale, events } = setup();
    for (let beat = 0; beat < 6; beat += 1) {
      vi.advanceTimersByTime(10_000);
      lastSource().beat();
    }
    expect(stale).toEqual([]);
    expect(events).toEqual([]);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("garde le flux vivant avec un message du serveur, qu'il passe à l'appelant", () => {
    const { stale, events } = setup();
    vi.advanceTimersByTime(10_000);
    lastSource().say(NUMBER_EVENT);
    vi.advanceTimersByTime(PHONE_STALE_MS - 1);
    expect(stale).toEqual([]);
    expect(events).toEqual([NUMBER_EVENT]);
    vi.advanceTimersByTime(1);
    expect(stale).toEqual([true]);
  });

  it("redevient vivant au battement qui suit une péremption, une seule fois", () => {
    const { stale } = setup();
    vi.advanceTimersByTime(PHONE_STALE_MS);
    vi.advanceTimersByTime(RECONNECT_MS);
    lastSource().beat();
    lastSource().beat();
    expect(stale).toEqual([true, false]);
  });

  it("Quand le flux a une erreur, le système doit le dire périmé tout de suite et rouvrir la connexion 1 s plus tard", () => {
    const { stale } = setup();
    const first = lastSource();
    first.onerror?.();
    expect(stale).toEqual([true]);
    expect(first.isClosed).toBe(true);
    vi.advanceTimersByTime(RECONNECT_MS);
    expect(FakeEventSource.instances).toHaveLength(2);
    lastSource().say(NUMBER_EVENT);
    expect(stale).toEqual([true, false]);
  });

  it("ne dit pas périmé deux fois de suite quand la nouvelle connexion reste muette aussi : elle est rouverte toutes les 16 s", () => {
    const { stale } = setup();
    lastSource().onerror?.();
    vi.advanceTimersByTime(RECONNECT_MS + PHONE_STALE_MS);
    expect(FakeEventSource.instances).toHaveLength(2);
    vi.advanceTimersByTime(RECONNECT_MS);
    expect(FakeEventSource.instances).toHaveLength(3);
    expect(stale).toEqual([true]);
  });

  it("Quand la page arrête de regarder, le système doit fermer la connexion et ne plus rien annoncer ni rouvrir", () => {
    const { stale, stop } = setup();
    vi.advanceTimersByTime(5000);
    stop();
    expect(lastSource().isClosed).toBe(true);
    vi.advanceTimersByTime(PHONE_STALE_MS * 4);
    expect(stale).toEqual([]);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("n'a pas de péremption pour un flux sans battement : la page OBS d'une caméra reste ouverte, muette, sans être rouverte", () => {
    const events: ScreenEvent[] = [];
    const stop = watchScreen("screen-0001", 1, (event) => events.push(event));
    vi.advanceTimersByTime(PHONE_STALE_MS * 4);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(lastSource().isClosed).toBe(false);
    stop();
  });
});
