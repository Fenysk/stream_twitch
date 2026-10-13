import { describe, expect, it } from "vitest";
import {
  IDLE_MODE,
  isSameMode,
  LISTENING_MODE,
  type Show,
  toFoxMode,
  toFoxModeRules,
  WAVE_MODE,
  YAWN_MODE,
} from "./fox-mode.rules";
import type { Settings } from "./settings.schema";

const smile: Show = { kind: "reaction", image: "front-smile-rest" };

describe("toFoxMode : la priorité du CDC", () => {
  const none = { show: null, isTalking: false, isYawning: false };

  it("ne montre rien de particulier au repos", () => {
    expect(toFoxMode(none)).toEqual(IDLE_MODE);
  });

  it("écoute Alexis quand il parle", () => {
    expect(toFoxMode({ ...none, isTalking: true })).toEqual(LISTENING_MODE);
  });

  it("bâille quand il s'ennuie", () => {
    expect(toFoxMode({ ...none, isYawning: true })).toEqual(YAWN_MODE);
  });

  it("préfère l'écoute au bâillement : si Alexis se met à parler, le bâillement s'arrête", () => {
    expect(toFoxMode({ show: null, isTalking: true, isYawning: true })).toEqual(LISTENING_MODE);
  });

  it("préfère la réaction ou le coucou à l'écoute et au bâillement", () => {
    expect(toFoxMode({ show: smile, isTalking: true, isYawning: true })).toEqual(smile);
    expect(toFoxMode({ show: WAVE_MODE, isTalking: false, isYawning: true })).toEqual(WAVE_MODE);
  });
});

describe("isSameMode", () => {
  it("reconnaît le même mode, et deux réactions de même image", () => {
    expect(isSameMode(IDLE_MODE, { kind: "idle" })).toBe(true);
    expect(isSameMode(smile, { kind: "reaction", image: "front-smile-rest" })).toBe(true);
  });

  it("distingue deux modes, et deux réactions d'images différentes", () => {
    expect(isSameMode(IDLE_MODE, LISTENING_MODE)).toBe(false);
    expect(isSameMode(smile, { kind: "reaction", image: "wink-tongue-rest" })).toBe(false);
    expect(isSameMode(smile, WAVE_MODE)).toBe(false);
    expect(isSameMode(WAVE_MODE, smile)).toBe(false);
  });
});

describe("toFoxModeRules", () => {
  const base: Settings = {
    obsAddress: "ws://127.0.0.1:4455",
    micName: "Mic/Aux",
    threshold: -40,
    delay: 250,
  };

  it("reprend les réglages du renard, avec le threshold et le delay de la tête", () => {
    const settings: Settings = {
      ...base,
      foxReadSilence: 1000,
      foxStopAfter: 1000,
      foxReactionDuration: 1000,
      foxJoyDuration: 800,
      foxYawnDuration: 2000,
      foxAwayAfter: 180_000,
      foxCrouchDuration: 300,
      foxJumpDuration: 400,
      foxDiveDuration: 800,
      foxReturnDuration: 800,
    };
    expect(toFoxModeRules(settings)).toEqual({
      threshold: -40,
      delay: 250,
      readSilence: 1000,
      stopAfter: 1000,
      reactionMs: 1000,
      joyMs: 800,
      yawnMs: 2000,
      awayAfter: 180_000,
      leaveMs: 1500,
      returnMs: 800,
    });
  });

  it("ne donne aucune règle quand settings.json n'a pas les réglages du renard", () => {
    expect(toFoxModeRules(base)).toBeUndefined();
  });
});
