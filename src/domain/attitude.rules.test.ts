import { describe, expect, it } from "vitest";
import {
  type AttitudeRules,
  isResumeDue,
  RESUME_GAP_MS,
  toAttitude,
  toAttitudeRules,
  toRecentTimes,
} from "./attitude.rules";
import type { Settings } from "./settings.schema";

const MINUTE = 60_000;

const rules: AttitudeRules = {
  cheerfulCount: 15,
  cheerfulPeriod: 5 * MINUTE,
  sulkAfter: 90_000,
  resumeAfter: 5 * MINUTE,
  resumePhrases: ["Ah, maintenant vous parlez ?"],
};

describe("toAttitudeRules : les réglages de l'humeur", () => {
  const base: Settings = {
    obsAddress: "ws://127.0.0.1:4455",
    micName: "Mic/Aux",
    threshold: -40,
    delay: 250,
  };

  it("les lit", () => {
    expect(
      toAttitudeRules({
        ...base,
        foxCheerfulCount: 15,
        foxCheerfulPeriod: 300_000,
        foxSulkAfter: 90_000,
        foxResumeAfter: 300_000,
        foxResumePhrases: ["Ah, maintenant vous parlez ?"],
      }),
    ).toEqual(rules);
  });

  it("n'en donne aucune quand un réglage manque : tous ou aucun", () => {
    expect(toAttitudeRules(base)).toBeUndefined();
    expect(
      toAttitudeRules({
        ...base,
        foxCheerfulCount: 15,
        foxCheerfulPeriod: 300_000,
        foxSulkAfter: 90_000,
        foxResumeAfter: 300_000,
      }),
    ).toBeUndefined();
  });
});

describe("toRecentTimes : les messages de la période", () => {
  it("garde ceux de moins de la période, et laisse sortir les autres", () => {
    const now = 1_000_000;
    expect(toRecentTimes([now - 400_000, now - 300_000, now - 299_999, now], now, 300_000)).toEqual([
      now - 299_999,
      now,
    ]);
    expect(toRecentTimes([], now, 300_000)).toEqual([]);
  });
});

describe("toAttitude : joyeux, boudeur ou ordinaire", () => {
  const now = 1_000_000;
  const recent = (count: number): number[] => Array.from({ length: count }, (_, index) => now - 1000 * index);
  const input = (overrides: Partial<Parameters<typeof toAttitude>[0]> = {}) => ({
    now,
    isVisible: true,
    lastChatAt: now - 1000,
    recent: recent(1),
    ...overrides,
  });

  it("est ordinaire quand le tchat parle comme d'habitude", () => {
    expect(toAttitude(input(), rules)).toBe("plain");
  });

  it("est joyeux à 15 messages acceptés dans la période, pas à 14", () => {
    expect(toAttitude(input({ recent: recent(15) }), rules)).toBe("cheerful");
    expect(toAttitude(input({ recent: recent(40) }), rules)).toBe("cheerful");
    expect(toAttitude(input({ recent: recent(14) }), rules)).toBe("plain");
  });

  it("suit le nombre de messages réglé", () => {
    expect(toAttitude(input({ recent: recent(5) }), { ...rules, cheerfulCount: 5 })).toBe("cheerful");
    expect(toAttitude(input({ recent: recent(4) }), { ...rules, cheerfulCount: 5 })).toBe("plain");
  });

  it("est boudeur visible, après 90 s sans message du tchat, pas avant", () => {
    expect(toAttitude(input({ lastChatAt: now - 89_999 }), rules)).toBe("plain");
    expect(toAttitude(input({ lastChatAt: now - 90_000 }), rules)).toBe("sulking");
    expect(toAttitude(input({ lastChatAt: now - 10 * MINUTE }), rules)).toBe("sulking");
  });

  it("suit le silence réglé", () => {
    expect(toAttitude(input({ lastChatAt: now - 30_000 }), { ...rules, sulkAfter: 30_000 })).toBe("sulking");
  });

  it("n'est jamais boudeur ni joyeux hors de la vue : parti, en train de partir ou de revenir", () => {
    expect(toAttitude(input({ isVisible: false, lastChatAt: now - 10 * MINUTE }), rules)).toBe("plain");
    expect(toAttitude(input({ isVisible: false, recent: recent(20) }), rules)).toBe("plain");
  });

  it("boude plutôt que de rester joyeux quand le tchat s'est animé puis tu", () => {
    expect(toAttitude(input({ lastChatAt: now - 2 * MINUTE, recent: recent(20) }), rules)).toBe("sulking");
  });
});

describe("isResumeDue : la reprise après un long silence", () => {
  const now = 10_000_000;

  it("est due après 5 min sans message du tchat, pas avant", () => {
    expect(isResumeDue({ now, lastChatAt: now - 5 * MINUTE + 1, lastResumeAt: null }, rules)).toBe(false);
    expect(isResumeDue({ now, lastChatAt: now - 5 * MINUTE, lastResumeAt: null }, rules)).toBe(true);
    expect(isResumeDue({ now, lastChatAt: now - 20 * MINUTE, lastResumeAt: null }, rules)).toBe(true);
  });

  it("suit le silence réglé", () => {
    expect(
      isResumeDue({ now, lastChatAt: now - 60_000, lastResumeAt: null }, { ...rules, resumeAfter: 60_000 }),
    ).toBe(true);
  });

  it("n'est due qu'une fois toutes les 30 min", () => {
    expect(RESUME_GAP_MS).toBe(30 * MINUTE);
    const lastChatAt = now - 10 * MINUTE;
    expect(isResumeDue({ now, lastChatAt, lastResumeAt: now - 30 * MINUTE + 1 }, rules)).toBe(false);
    expect(isResumeDue({ now, lastChatAt, lastResumeAt: now - 30 * MINUTE }, rules)).toBe(true);
  });
});
