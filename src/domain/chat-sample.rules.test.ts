import { describe, expect, it } from "vitest";
import type { ChatFragment, ChatMessage } from "./chat.schema";
import { toReadableColor } from "./chat-color.rules";
import { CHAT_SAMPLE_COUNT, toSampleMessage } from "./chat-sample.rules";

// Les emotes globales de Twitch utilisées : l'identifiant et le mot qu'il remplace vont ensemble.
const EMOTE_NAMES: Record<string, string> = {
  "25": "Kappa",
  "425618": "LUL",
  "41": "Kreygasm",
  "354": "4Head",
  "30259": "HeyGuys",
  "64138": "SeemsGood",
};

const ASTRAL = /[\u{10000}-\u{10FFFF}]/u;

// Un tour complet de la liste, dans l'ordre où l'aperçu les montre.
const cycle = (): ChatMessage[] =>
  Array.from({ length: CHAT_SAMPLE_COUNT }, (_, count) => {
    const message = toSampleMessage(count, 1000);
    if (!message) throw new Error(`aucun message de test pour ${count}`);
    return message;
  });

const textOf = ({ fragments }: ChatMessage): string =>
  fragments.map((fragment) => (fragment.kind === "text" ? fragment.text : fragment.name)).join("");

const isEmote = (fragment: ChatFragment): boolean => fragment.kind === "emote";

describe("toSampleMessage : la rotation", () => {
  it("compte une dizaine de messages de test", () => {
    expect(CHAT_SAMPLE_COUNT).toBeGreaterThanOrEqual(10);
  });

  it("donne le message suivant à chaque appel, et recommence après le dernier", () => {
    const messages = cycle();
    expect(new Set(messages.map(textOf)).size).toBe(CHAT_SAMPLE_COUNT);
    expect(toSampleMessage(CHAT_SAMPLE_COUNT, 1000)?.fragments).toEqual(messages[0]?.fragments);
    expect(toSampleMessage(CHAT_SAMPLE_COUNT + 3, 1000)?.fragments).toEqual(messages[3]?.fragments);
  });

  it("date chaque message de l'instant donné, et lui donne un identifiant propre à son rang", () => {
    const first = toSampleMessage(0, 5000);
    const loop = toSampleMessage(CHAT_SAMPLE_COUNT, 9000);
    expect(first?.receivedAt).toBe(5000);
    expect(loop?.receivedAt).toBe(9000);
    expect(first?.id).not.toBe(loop?.id);
    expect(new Set(cycle().map(({ id }) => id)).size).toBe(CHAT_SAMPLE_COUNT);
  });

  it("alterne les messages masqués et les autres : l'aperçu ne reçoit jamais deux messages cachés de suite", () => {
    const flags = [...cycle(), ...cycle()].map(({ isHidden }) => isHidden);
    expect(flags.some((isHidden, index) => isHidden && flags[index + 1] === true)).toBe(false);
  });
});

describe("toSampleMessage : ce que la liste montre", () => {
  it("a des pseudos tous différents, et aucun vide", () => {
    const nicknames = cycle().map(({ nickname }) => nickname);
    expect(new Set(nicknames).size).toBe(CHAT_SAMPLE_COUNT);
    expect(nicknames.every((nickname) => nickname.length > 0)).toBe(true);
  });

  it("varie les couleurs : un pseudo sans couleur, et un si sombre qu'il est éclairci", () => {
    const messages = cycle();
    expect(messages.some(({ color }) => color === null)).toBe(true);
    expect(new Set(messages.map(({ color }) => color)).size).toBeGreaterThanOrEqual(6);
    expect(messages.some(({ color }) => color !== null && toReadableColor(color) !== color)).toBe(true);
  });

  it("a un message court, et un long qui passe sur plusieurs lignes", () => {
    const lengths = cycle().map((message) => textOf(message).length);
    expect(Math.min(...lengths)).toBeLessThanOrEqual(8);
    expect(Math.max(...lengths)).toBeGreaterThanOrEqual(120);
  });

  it("a une emote seule, un message à plusieurs emotes, et un emoji avant une emote", () => {
    const messages = cycle();
    expect(messages.some(({ fragments }) => fragments.length === 1 && fragments.every(isEmote))).toBe(true);
    expect(messages.some(({ fragments }) => fragments.filter(isEmote).length >= 3)).toBe(true);
    expect(
      messages.some(({ fragments }) => {
        const emoteAt = fragments.findIndex(isEmote);
        return (
          emoteAt > 0 && fragments.slice(0, emoteAt).some((f) => f.kind === "text" && ASTRAL.test(f.text))
        );
      }),
    ).toBe(true);
  });

  it("n'utilise que de vraies emotes globales, chacune avec son mot", () => {
    for (const { fragments } of cycle()) {
      for (const fragment of fragments) {
        if (fragment.kind === "emote") expect(EMOTE_NAMES[fragment.id]).toBe(fragment.name);
      }
    }
  });

  it("a une commande et un bot de la liste, masqués, pour que la case se voie dans l'aperçu", () => {
    const hidden = cycle().filter(({ isHidden }) => isHidden);
    expect(hidden.some((message) => textOf(message).startsWith("!lurk"))).toBe(true);
    expect(hidden.some(({ nickname }) => nickname === "Nightbot")).toBe(true);
    expect(hidden).toHaveLength(2);
  });
});
