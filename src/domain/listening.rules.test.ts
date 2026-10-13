import { describe, expect, it } from "vitest";
import {
  isVoiceTalking,
  toNextVoice,
  toSilentFor,
  toTalkingFor,
  VOICE_START,
  type Voice,
} from "./listening.rules";

const rules = { threshold: -40, delay: 250 };
const LOUD = -15;
const QUIET = -70;

// Un mic qui donne un level toutes les 50 ms, comme OBS.
const run = (start: Voice, from: number, to: number, level: (now: number) => number): Voice => {
  let voice = start;
  for (let now = from; now < to; now += 50) voice = toNextVoice(voice, { now, level: level(now), ...rules });
  return voice;
};

describe("toNextVoice : la détection de la tête (threshold, delay)", () => {
  it("ne dit rien tant que le mic reste sous le threshold", () => {
    const voice = run(VOICE_START, 0, 5000, () => QUIET);
    expect(voice).toEqual(VOICE_START);
    expect(isVoiceTalking(voice, 5000, 250)).toBe(false);
  });

  it("entend Alexis dès un level au-dessus du threshold, et note depuis quand il parle", () => {
    const voice = toNextVoice(VOICE_START, { now: 1000, level: LOUD, ...rules });
    expect(voice).toEqual({ lastLoudAt: 1000, talkingSince: 1000 });
    expect(isVoiceTalking(voice, 1000, 250)).toBe(true);
  });

  it("garde sa voix pour un level pile sur le threshold : « au-dessus » est strict, comme pour la tête", () => {
    expect(toNextVoice(VOICE_START, { now: 0, level: -40, ...rules })).toEqual(VOICE_START);
  });

  it("continue de parler pendant le delay après le dernier level fort, puis se tait", () => {
    const voice = toNextVoice(VOICE_START, { now: 1000, level: LOUD, ...rules });
    expect(isVoiceTalking(voice, 1249, 250)).toBe(true);
    expect(isVoiceTalking(voice, 1250, 250)).toBe(false);
    const quiet = toNextVoice(voice, { now: 1300, level: QUIET, ...rules });
    expect(quiet.talkingSince).toBeNull();
    expect(quiet.lastLoudAt).toBe(1000);
  });

  it("garde la même heure de début quand il parle sans s'arrêter, pauses de moins du delay comprises", () => {
    const voice = run(VOICE_START, 0, 3000, (now) => (now % 200 < 100 ? LOUD : QUIET));
    expect(voice.talkingSince).toBe(0);
    expect(toTalkingFor(voice, 2950)).toBe(2950);
  });

  it("repart d'une nouvelle heure de début après un silence plus long que le delay", () => {
    let voice = run(VOICE_START, 0, 1000, () => LOUD);
    voice = run(voice, 1000, 2000, () => QUIET);
    expect(voice.talkingSince).toBeNull();
    voice = toNextVoice(voice, { now: 2000, level: LOUD, ...rules });
    expect(voice.talkingSince).toBe(2000);
  });

  it("laisse passer le temps sans level : la voix se tait au bout du delay", () => {
    let voice = toNextVoice(VOICE_START, { now: 0, level: LOUD, ...rules });
    voice = toNextVoice(voice, { now: 300, ...rules });
    expect(voice).toEqual({ lastLoudAt: 0, talkingSince: null });
  });

  it("suit le threshold et le delay des réglages", () => {
    const sensitive = toNextVoice(VOICE_START, { now: 0, level: -45, threshold: -50, delay: 1000 });
    expect(isVoiceTalking(sensitive, 999, 1000)).toBe(true);
    expect(isVoiceTalking(sensitive, 1000, 1000)).toBe(false);
  });
});

describe("toSilentFor", () => {
  it("est infini tant qu'Alexis n'a rien dit depuis le démarrage", () => {
    expect(toSilentFor(VOICE_START, 123_456)).toBe(Number.POSITIVE_INFINITY);
  });

  it("compte les ms depuis le dernier level fort", () => {
    const voice = toNextVoice(VOICE_START, { now: 5000, level: LOUD, ...rules });
    expect(toSilentFor(voice, 5000)).toBe(0);
    expect(toSilentFor(voice, 5999)).toBe(999);
    expect(toSilentFor(voice, 6000)).toBe(1000);
  });
});

describe("toTalkingFor", () => {
  it("vaut 0 quand il se tait", () => {
    expect(toTalkingFor(VOICE_START, 9999)).toBe(0);
  });

  it("compte les ms depuis qu'il parle", () => {
    const voice = toNextVoice(VOICE_START, { now: 1000, level: LOUD, ...rules });
    expect(toTalkingFor(voice, 2500)).toBe(1500);
  });
});
