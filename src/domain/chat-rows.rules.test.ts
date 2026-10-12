import { describe, expect, it } from "vitest";
import type { ChatLook, ChatMessage } from "./chat.schema";
import { type ChatRow, toKeptRows, toNextRows, toNextWake, toShownMessages } from "./chat-rows.rules";

const FADE_MS = 500;

const look: ChatLook = {
  style: "pill",
  opacity: 85,
  textSize: 20,
  duration: 60,
  maxMessages: 3,
  animation: "rise",
  shouldShowHidden: false,
};

const message = (id: string, receivedAt: number, isHidden = false): ChatMessage => ({
  id,
  nickname: "Alice",
  color: null,
  fragments: [{ kind: "text", text: id }],
  isHidden,
  receivedAt,
});

const ids = (messages: ChatMessage[]): string[] => messages.map((candidate) => candidate.id);
const rowIds = (rows: ChatRow[]): string[] => rows.map((row) => row.message.id);

describe("toShownMessages", () => {
  it("ne montre que les derniers messages, jusqu'au maximum réglé", () => {
    const messages = [message("a", 1000), message("b", 2000), message("c", 3000), message("d", 4000)];
    expect(ids(toShownMessages(messages, look, 5000))).toEqual(["b", "c", "d"]);
  });

  it("masque les commandes et les bots, sans qu'ils comptent dans le maximum", () => {
    const messages = [message("a", 1000), message("b", 2000, true), message("c", 3000), message("d", 4000)];
    expect(ids(toShownMessages(messages, look, 5000))).toEqual(["a", "c", "d"]);
  });

  it("les montre quand le réglage le demande", () => {
    const messages = [message("a", 1000), message("b", 2000, true)];
    expect(ids(toShownMessages(messages, { ...look, shouldShowHidden: true }, 5000))).toEqual(["a", "b"]);
  });

  it("retire un message quand sa durée est écoulée, à la milliseconde près", () => {
    const messages = [message("a", 1000)];
    expect(ids(toShownMessages(messages, look, 60_999))).toEqual(["a"]);
    expect(ids(toShownMessages(messages, look, 61_000))).toEqual([]);
  });

  it("garde les messages sans limite de temps quand la durée est 0", () => {
    const messages = [message("a", 1000)];
    expect(ids(toShownMessages(messages, { ...look, duration: 0 }, 99_999_999))).toEqual(["a"]);
  });
});

describe("toNextRows", () => {
  it("fait une rangée par message montré", () => {
    const rows = toNextRows([], [message("a", 1000), message("b", 2000)], 3000);
    expect(rows).toEqual([
      { message: message("a", 1000), leftAt: null },
      { message: message("b", 2000), leftAt: null },
    ]);
  });

  it("garde à sa place un message qui n'est plus montré, noté parti à cet instant", () => {
    const first = toNextRows([], [message("a", 1000), message("b", 2000), message("c", 3000)], 3000);
    const next = toNextRows(first, [message("a", 1000), message("c", 3000)], 4000);
    expect(rowIds(next)).toEqual(["a", "b", "c"]);
    expect(next.map((row) => row.leftAt)).toEqual([null, 4000, null]);
  });

  it("garde l'heure de départ d'origine aux passages suivants", () => {
    const first = toNextRows([], [message("a", 1000), message("b", 2000)], 3000);
    const left = toNextRows(first, [message("b", 2000)], 4000);
    const later = toNextRows(left, [message("b", 2000)], 4300);
    expect(later.find((row) => row.message.id === "a")?.leftAt).toBe(4000);
  });

  it("remet en place un message qui revient (la case des commandes cochée à nouveau)", () => {
    const first = toNextRows([], [message("a", 1000), message("b", 2000)], 3000);
    const left = toNextRows(first, [message("b", 2000)], 4000);
    const back = toNextRows(left, [message("a", 1000), message("b", 2000)], 4100);
    expect(back.map((row) => row.leftAt)).toEqual([null, null]);
  });

  it("ajoute un nouveau message à la fin, après ceux qui partent", () => {
    const first = toNextRows([], [message("a", 1000)], 2000);
    const next = toNextRows(first, [message("b", 3000)], 3000);
    expect(rowIds(next)).toEqual(["a", "b"]);
  });
});

describe("toKeptRows", () => {
  it("retire les rangées parties depuis la durée du fondu, et garde les autres", () => {
    const rows: ChatRow[] = [
      { message: message("a", 1000), leftAt: 4000 },
      { message: message("b", 2000), leftAt: 4400 },
      { message: message("c", 3000), leftAt: null },
    ];
    expect(rowIds(toKeptRows(rows, 4500, FADE_MS))).toEqual(["b", "c"]);
    expect(rowIds(toKeptRows(rows, 4900, FADE_MS))).toEqual(["c"]);
  });
});

describe("toNextWake", () => {
  it("ne réveille personne quand rien ne doit changer", () => {
    expect(toNextWake([], look, FADE_MS)).toBeNull();
    const rows: ChatRow[] = [{ message: message("a", 1000), leftAt: null }];
    expect(toNextWake(rows, { ...look, duration: 0 }, FADE_MS)).toBeNull();
  });

  it("vise la fin de vie du plus ancien message montré", () => {
    const rows: ChatRow[] = [
      { message: message("a", 1000), leftAt: null },
      { message: message("b", 2000), leftAt: null },
    ];
    expect(toNextWake(rows, look, FADE_MS)).toBe(61_000);
  });

  it("vise la fin du fondu d'une rangée qui part, si elle arrive avant", () => {
    const rows: ChatRow[] = [
      { message: message("a", 1000), leftAt: 5000 },
      { message: message("b", 2000), leftAt: null },
    ];
    expect(toNextWake(rows, look, FADE_MS)).toBe(5500);
  });
});
