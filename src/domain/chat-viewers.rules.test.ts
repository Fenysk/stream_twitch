import { describe, expect, it } from "vitest";
import { toSortedChatViewers } from "./chat-viewers.rules";
import type { ChatViewer } from "./chat-viewers.schema";

const chatViewer = (id: string, nickname: string): ChatViewer => ({ id, nickname });
const nicknames = (chatViewers: readonly ChatViewer[]): string[] =>
  chatViewers.map(({ nickname }) => nickname);

describe("toSortedChatViewers", () => {
  it("trie par pseudo, sans tenir compte de la casse", () => {
    const sorted = toSortedChatViewers([
      chatViewer("1", "zoe"),
      chatViewer("2", "Bob"),
      chatViewer("3", "alice"),
      chatViewer("4", "Charlie"),
    ]);
    expect(nicknames(sorted)).toEqual(["alice", "Bob", "Charlie", "zoe"]);
  });

  it("met un pseudo accentué à sa place alphabétique, au lieu de le rejeter après le z", () => {
    const sorted = toSortedChatViewers([
      chatViewer("1", "Zoé"),
      chatViewer("2", "Élise"),
      chatViewer("3", "elsa"),
      chatViewer("4", "Bob"),
    ]);
    expect(nicknames(sorted)).toEqual(["Bob", "Élise", "elsa", "Zoé"]);
  });

  it("garde l'ordre des identifiants quand deux pseudos sont les mêmes à la casse près", () => {
    const sorted = toSortedChatViewers([chatViewer("20", "Bob"), chatViewer("10", "bob")]);
    expect(sorted.map(({ id }) => id)).toEqual(["10", "20"]);
  });

  it("ne touche pas à la liste qu'on lui donne, et rend une liste vide pour une liste vide", () => {
    const original = [chatViewer("1", "zoe"), chatViewer("2", "alice")];
    toSortedChatViewers(original);
    expect(nicknames(original)).toEqual(["zoe", "alice"]);
    expect(toSortedChatViewers([])).toEqual([]);
  });
});
