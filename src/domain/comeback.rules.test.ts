import { describe, expect, it } from "vitest";
import {
  COMEBACK_START,
  type Comeback,
  type ComebackStep,
  toComebackRules,
  toNextComeback,
  toSpokenGone,
} from "./comeback.rules";
import type { Settings } from "./settings.schema";

const AFTER = 300_000;
const MINUTE = 60_000;
const FOREVER = Number.POSITIVE_INFINITY;
const here: Comeback = { kind: "here" };

// Un pas : l'heure, sa voix au-dessus du threshold ou non, et depuis combien de ms il se tait.
const step = (previous: Comeback, now: number, isTalking: boolean, silentFor: number): ComebackStep =>
  toNextComeback(previous, { now, isTalking, silentFor, after: AFTER });

// L'instant où son silence atteint 5 min : l'absence a commencé 5 min plus tôt.
const START = 1_000_000;
const gone: Comeback = step(here, START, false, AFTER).comeback;

// Un pas de 100 ms par caractère : « T » sa voix est là, « . » rien. Rend l'état final, l'heure du dernier pas et le premier
// retour vu (sa durée), comme la boucle du renard.
const play = (start: Comeback, from: number, pattern: string) => {
  let comeback = start;
  let now = from;
  let goneFor: number | null = null;
  for (const mark of pattern) {
    now += 100;
    const next = step(comeback, now, mark === "T", mark === "T" ? 0 : AFTER);
    comeback = next.comeback;
    goneFor ??= next.goneFor;
  }
  return { comeback, now, goneFor };
};

// Des pas de voix, `silenceMs` ms de rien, puis d'autres pas.
const pattern = (voice: string, silenceMs: number, then = ""): string =>
  [voice, ".".repeat(silenceMs / 100), then].join("");

describe("toComebackRules", () => {
  const base: Settings = {
    obsAddress: "ws://127.0.0.1:4455",
    micName: "Mic/Aux",
    threshold: -40,
    delay: 250,
  };

  it("reprend la durée d'absence et la case des réglages", () => {
    expect(toComebackRules({ ...base, foxComebackAfter: AFTER, foxShouldHailComeback: true })).toEqual({
      after: AFTER,
      shouldHail: true,
    });
    expect(
      toComebackRules({ ...base, foxComebackAfter: 60_000, foxShouldHailComeback: false })?.shouldHail,
    ).toBe(false);
  });

  it("ne donne aucune règle sans les réglages du renard", () => {
    expect(toComebackRules(base)).toBeUndefined();
    expect(toComebackRules({ ...base, foxComebackAfter: AFTER })).toBeUndefined();
    expect(toComebackRules({ ...base, foxShouldHailComeback: true })).toBeUndefined();
  });
});

describe("toNextComeback : une absence ne commence qu'après avoir entendu Fenysk", () => {
  it("ne compte rien tant qu'il n'a jamais été entendu, même après des heures", () => {
    expect(step(COMEBACK_START, START, false, FOREVER)).toEqual({
      comeback: COMEBACK_START,
      goneFor: null,
    });
  });

  it("n'y voit pas un retour quand sa première parole arrive après l'ouverture d'OBS", () => {
    expect(step(COMEBACK_START, START, true, 0)).toEqual({ comeback: here, goneFor: null });
    expect(step(COMEBACK_START, START, true, 10 * MINUTE)).toEqual({ comeback: here, goneFor: null });
  });

  it("reste là tant que son silence dure moins de 5 min, à 1 ms près", () => {
    expect(step(here, START, false, AFTER - 1)).toEqual({ comeback: here, goneFor: null });
  });

  it("est parti à 5 min de silence pile, et le reste tant que sa voix ne revient pas", () => {
    const left = step(here, START, false, AFTER);
    expect(left.goneFor).toBeNull();
    expect(left.comeback.kind).toBe("gone");
    expect(play(left.comeback, START, "........").comeback.kind).toBe("gone");
  });
});

describe("toNextComeback : le retour demande 1 s de voix sur 3 s", () => {
  it("rend la durée de l'absence au pas où la voix atteint 1 s, une seule fois", () => {
    const back = play(gone, START, "TTTTTTTTTT");
    expect(back.goneFor).toBe(AFTER + 1000);
    expect(back.comeback).toEqual(here);
    expect(play(back.comeback, back.now, "TTTTTTTTTT").goneFor).toBeNull();
  });

  it("ne déclenche rien à 0,9 s de voix, ni pour une mesure isolée (toux, bruit)", () => {
    expect(play(gone, START, "TTTTTTTTT").goneFor).toBeNull();
    const cough = play(gone, START, pattern("T", 6000));
    expect(cough.goneFor).toBeNull();
    expect(cough.comeback.kind).toBe("gone");
  });

  it("ne remet pas l'absence à zéro après une toux : le retour dit toute la durée", () => {
    const cough = play(gone, START, pattern("T", 60_000));
    const back = play(cough.comeback, cough.now, "TTTTTTTTTT");
    expect(back.goneFor).toBe(AFTER + 61_100);
  });

  it("cumule la voix : 0,5 s, une pause de 1,5 s, puis 0,5 s tiennent dans 3 s", () => {
    expect(play(gone, START, pattern("TTTTT", 1500, "TTTTT")).goneFor).not.toBeNull();
  });

  it("ne cumule pas au-delà de 3 s : 0,5 s, une pause de 3,5 s, puis 0,5 s ne font pas 1 s", () => {
    expect(play(gone, START, pattern("TTTTT", 3500, "TTTTT")).goneFor).toBeNull();
  });

  it("ne compte pas plus de 250 ms pour un pas en retard", () => {
    const late = step(gone, START + 5000, true, 0);
    const next = step(late.comeback, START + 5100, true, 0);
    expect(late.goneFor).toBeNull();
    expect(next.goneFor).toBeNull();
    expect(step(next.comeback, START + 5200, true, 0).goneFor).toBeNull();
  });

  it("attend une nouvelle absence de 5 min pour un deuxième retour", () => {
    const back = play(gone, START, "TTTTTTTTTT");
    const pause = step(back.comeback, back.now + 2 * MINUTE, false, 2 * MINUTE);
    expect(pause).toEqual({ comeback: here, goneFor: null });
    expect(play(pause.comeback, back.now + 2 * MINUTE, "TTTTTTTTTT").goneFor).toBeNull();
    const again = step(here, back.now + AFTER, false, AFTER);
    expect(play(again.comeback, back.now + AFTER, "TTTTTTTTTT").goneFor).toBe(AFTER + 1000);
  });

  it("garde l'absence commencée même si le réglage monte au-dessus de son silence en cours", () => {
    const next = toNextComeback(gone, {
      now: START + 100,
      isTalking: false,
      silentFor: AFTER,
      after: 30 * MINUTE,
    });
    expect(next).toEqual({ comeback: expect.objectContaining({ kind: "gone" }), goneFor: null });
  });
});

describe("toSpokenGone : la durée de l'absence à voix haute", () => {
  it("dit les minutes entières, arrondies à la plus proche", () => {
    expect(toSpokenGone(5 * MINUTE)).toBe("5 minutes");
    expect(toSpokenGone(12 * MINUTE + 20_000)).toBe("12 minutes");
    expect(toSpokenGone(12 * MINUTE + 40_000)).toBe("13 minutes");
  });

  it("dit une minute au moins, au singulier", () => {
    expect(toSpokenGone(10_000)).toBe("1 minute");
    expect(toSpokenGone(MINUTE)).toBe("1 minute");
  });

  it("passe aux heures à partir de 60 minutes", () => {
    expect(toSpokenGone(60 * MINUTE)).toBe("1 heure");
    expect(toSpokenGone(70 * MINUTE)).toBe("1 heure 10");
    expect(toSpokenGone(150 * MINUTE)).toBe("2 heures 30");
  });
});
