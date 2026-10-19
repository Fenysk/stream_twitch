import { describe, expect, it } from "vitest";
import {
  BOTTOM_TOLERANCE_PX,
  INITIAL_STICK,
  isAtBottom,
  type ScrollMetrics,
  type StickState,
  shouldFollowResize,
  toStickAfterJump,
  toStickAfterMessages,
  toStickAfterScroll,
} from "./chat-scroll";

// Une zone de 400 px de haut qui montre 1000 px de messages : en bas, `scrollTop` vaut 600.
const metrics = (scrollTop: number, scrollHeight = 1000): ScrollMetrics => ({
  scrollTop,
  clientHeight: 400,
  scrollHeight,
});

const PINNED: StickState = { isPinned: true, hasNews: false };
const READING: StickState = { isPinned: false, hasNews: false };
const READING_WITH_NEWS: StickState = { isPinned: false, hasNews: true };

describe("isAtBottom", () => {
  it("dit en bas quand la vue touche la fin de la zone", () => {
    expect(isAtBottom(metrics(600))).toBe(true);
  });

  it("dit en bas à quelques pixels de la fin : sous-pixels, rebond d'iOS", () => {
    expect(isAtBottom(metrics(600 - BOTTOM_TOLERANCE_PX))).toBe(true);
    expect(isAtBottom(metrics(600 - BOTTOM_TOLERANCE_PX - 1))).toBe(false);
  });

  it("dit en haut ou au milieu quand on a remonté lire l'historique", () => {
    expect(isAtBottom(metrics(0))).toBe(false);
    expect(isAtBottom(metrics(300))).toBe(false);
  });

  it("dit en bas quand il n'y a rien à faire défiler", () => {
    expect(isAtBottom({ scrollTop: 0, clientHeight: 400, scrollHeight: 120 })).toBe(true);
    expect(isAtBottom({ scrollTop: 0, clientHeight: 400, scrollHeight: 0 })).toBe(true);
  });
});

describe("toStickAfterScroll", () => {
  it("décolle la vue quand l'utilisateur remonte, sans allumer la pastille", () => {
    expect(toStickAfterScroll(PINNED, metrics(100))).toEqual(READING);
  });

  it("recolle la vue et éteint la pastille quand l'utilisateur redescend en bas lui-même", () => {
    expect(toStickAfterScroll(READING_WITH_NEWS, metrics(600))).toEqual(PINNED);
  });

  it("garde la pastille allumée tant que l'utilisateur lit plus haut", () => {
    expect(toStickAfterScroll(READING_WITH_NEWS, metrics(200))).toEqual(READING_WITH_NEWS);
  });

  it("reste collée quand le défilement vient de la vue qui se recolle elle-même en bas", () => {
    expect(toStickAfterScroll(PINNED, metrics(600))).toEqual(PINNED);
  });
});

describe("toStickAfterMessages", () => {
  it("Quand l'utilisateur était en bas, le système doit le garder en bas à chaque message, sans allumer la pastille", () => {
    expect(toStickAfterMessages(PINNED, 1)).toEqual({ state: PINNED, shouldScroll: true });
  });

  it("le garde en bas même quand les messages arrivent en rafale", () => {
    let state = PINNED;
    for (let burst = 0; burst < 30; burst += 1) {
      const next = toStickAfterMessages(state, 1);
      expect(next.shouldScroll).toBe(true);
      state = next.state;
    }
    expect(state).toEqual(PINNED);
    expect(toStickAfterMessages(PINNED, 12).shouldScroll).toBe(true);
  });

  it("Quand l'utilisateur a remonté lire l'historique, le système ne doit rien bouger et allumer la pastille", () => {
    expect(toStickAfterMessages(READING, 1)).toEqual({ state: READING_WITH_NEWS, shouldScroll: false });
    expect(toStickAfterMessages(READING_WITH_NEWS, 5)).toEqual({
      state: READING_WITH_NEWS,
      shouldScroll: false,
    });
  });

  it("ne fait rien quand aucun message n'est arrivé : un message supprimé ou une allure qui change", () => {
    expect(toStickAfterMessages(PINNED, 0)).toEqual({ state: PINNED, shouldScroll: false });
    expect(toStickAfterMessages(READING, 0)).toEqual({ state: READING, shouldScroll: false });
  });
});

describe("toStickAfterJump et shouldFollowResize", () => {
  it("revient en bas, collé et sans pastille, au toucher sur « Nouveaux messages »", () => {
    expect(toStickAfterJump()).toEqual(PINNED);
    expect(toStickAfterJump()).toEqual(INITIAL_STICK);
  });

  it("suit la taille de la zone (clavier ouvert, emote chargée) seulement quand elle est collée en bas", () => {
    expect(shouldFollowResize(PINNED)).toBe(true);
    expect(shouldFollowResize(READING)).toBe(false);
    expect(shouldFollowResize(READING_WITH_NEWS)).toBe(false);
  });
});
