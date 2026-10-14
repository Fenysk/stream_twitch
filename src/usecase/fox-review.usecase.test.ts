import { describe, expect, it } from "vitest";
import type { RawMessage } from "../domain/chat.types";
import { toInsultList } from "../domain/chat-insults.rules";
import type { Settings } from "../domain/settings.schema";
import type { QueueItem } from "./fox-queue.usecase";
import { createFoxReview } from "./fox-review.usecase";
import { createFoxTally } from "./fox-tally.usecase";

const settings: Settings = {
  obsAddress: "ws://127.0.0.1:4455",
  micName: "Mic/Aux",
  threshold: -40,
  delay: 250,
  foxShouldReviewAtEnd: true,
};

const insults = toInsultList("connard");

const message = (viewerId: string, nickname: string): RawMessage => ({
  id: `${viewerId}-m`,
  viewerId,
  viewerLogin: nickname.toLowerCase(),
  nickname,
  color: null,
  text: "Bonjour",
  emotes: [],
  isCommand: false,
});

const setup = (custom: Settings = settings) => {
  const tally = createFoxTally();
  const pushed: QueueItem[] = [];
  const logs: string[] = [];
  const review = createFoxReview({
    tally,
    queue: { push: (item) => pushed.push(item) },
    settings: custom,
    insults,
    log: (line) => logs.push(line),
  });
  const write = (...writers: [viewerId: string, nickname: string, count: number][]) => {
    for (const [viewerId, nickname, count] of writers) {
      for (let index = 0; index < count; index += 1) tally.noteMessage(message(viewerId, nickname));
    }
  };
  return { review, write, pushed, logs };
};

describe("createFoxReview : « Faire le bilan »", () => {
  it("met le bilan dans la file, devant les messages, tourné vers le tchat, sans être coupé", () => {
    const { review, write, pushed } = setup();
    write(["v1", "Alice", 4], ["v2", "Bob", 12]);
    const result = review.say();
    expect(result).toEqual({
      ok: true,
      text: "Ce live : 16 messages, de 2 personnes. Le plus bavard : Bob, avec 12 messages. Premier arrivé : Alice.",
    });
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({
      kind: "review",
      text: result.ok ? result.text : "",
      isCuttable: false,
      isUrgent: true,
    });
    expect(pushed[0]?.toShow()).toBeNull();
  });

  it("l'écrit au journal", () => {
    const { review, write, logs } = setup();
    write(["v1", "Alice", 2]);
    review.say();
    expect(logs).toEqual([
      "Renard : bilan du live : « Ce live : 2 messages, de 1 personne. Le plus bavard : Alice, avec 2 messages. Premier arrivé : Alice. »",
    ]);
  });

  it("dit pourquoi il ne dit rien quand personne n'a écrit, et ne met rien dans la file", () => {
    const { review, pushed } = setup();
    expect(review.say()).toEqual({
      ok: false,
      message: "personne n'a écrit depuis le démarrage du serveur : rien à dire",
    });
    expect(pushed).toEqual([]);
  });

  it("saute un pseudo refusé par le filtre d'insultes, et ne le met pas dans la file", () => {
    const { review, write, pushed } = setup();
    write(["v1", "connard", 9], ["v2", "Bob", 2]);
    review.say();
    expect(pushed[0]?.text).toBe("Ce live : 11 messages, de 2 personnes.");
    expect(pushed[0]?.text).not.toContain("connard");
  });

  it("marche aussi case décochée : le bouton est une demande", () => {
    const { review, write, pushed } = setup({ ...settings, foxShouldReviewAtEnd: false });
    write(["v1", "Alice", 1]);
    expect(review.say().ok).toBe(true);
    expect(pushed).toHaveLength(1);
  });

  it("compte ce que le tally compte, au moment où on le demande", () => {
    const { review, write, pushed } = setup();
    write(["v1", "Alice", 1]);
    review.say();
    write(["v1", "Alice", 2]);
    review.say();
    expect(pushed.map(({ text }) => text.slice(0, 22))).toEqual([
      "Ce live : 1 message, d",
      "Ce live : 3 messages, ",
    ]);
  });
});

describe("createFoxReview : le bilan à la fin prévue", () => {
  it("le dit quand la case est cochée", () => {
    const { review, write, pushed } = setup();
    write(["v1", "Alice", 3]);
    review.sayAtEnd();
    expect(pushed).toHaveLength(1);
    expect(pushed[0]?.kind).toBe("review");
  });

  it("ne dit rien quand la case est décochée, et suit la case changée en direct", () => {
    const { review, write, pushed } = setup({ ...settings, foxShouldReviewAtEnd: false });
    write(["v1", "Alice", 3]);
    review.sayAtEnd();
    expect(pushed).toEqual([]);
    review.update(settings);
    review.sayAtEnd();
    expect(pushed).toHaveLength(1);
    review.update({ ...settings, foxShouldReviewAtEnd: false });
    review.sayAtEnd();
    expect(pushed).toHaveLength(1);
  });

  it("n'a rien à dire quand personne n'a écrit : le journal le dit, la file reste vide", () => {
    const { review, pushed, logs } = setup();
    review.sayAtEnd();
    expect(pushed).toEqual([]);
    expect(logs).toEqual([
      "Renard : pas de bilan à la fin prévue, personne n'a écrit depuis le démarrage du serveur : rien à dire.",
    ]);
  });

  it("ne dit rien sans les réglages du renard", () => {
    const { review, write, pushed } = setup({
      obsAddress: settings.obsAddress,
      micName: "x",
      threshold: -40,
      delay: 250,
    });
    write(["v1", "Alice", 3]);
    review.sayAtEnd();
    expect(pushed).toEqual([]);
  });
});
