import { describe, expect, it } from "vitest";
import { isJabDue, type JabRules, toJabRules, toNextSilenceKind } from "./jab.rules";
import type { Settings } from "./settings.schema";

const rules: JabRules = { after: 180_000, gap: 600_000 };
const FOREVER = Number.POSITIVE_INFINITY;
const due = { awayFor: 180_000, voiceSilentFor: 200_000, chatSilentFor: 300_000, sinceLastJab: FOREVER };

describe("isJabDue : la relance", () => {
  it("est due quand il est parti, que tout le monde se tait depuis 3 min au moins, et qu'il n'a encore jamais piqué", () => {
    expect(isJabDue(due, rules)).toBe(true);
  });

  it("n'est pas due tant qu'il est visible : il ne pique que caché", () => {
    expect(isJabDue({ ...due, awayFor: null }, rules)).toBe(false);
  });

  it("compte le silence depuis son départ au plus tôt : parti depuis moins de 3 min, il ne revient pas", () => {
    expect(isJabDue({ ...due, awayFor: 179_999 }, rules)).toBe(false);
    expect(isJabDue({ ...due, awayFor: 180_000 }, rules)).toBe(true);
  });

  it("n'est pas due si Fenysk a parlé il y a moins de 3 min", () => {
    expect(isJabDue({ ...due, voiceSilentFor: 179_999 }, rules)).toBe(false);
    expect(isJabDue({ ...due, voiceSilentFor: 180_000 }, rules)).toBe(true);
  });

  it("n'est pas due si le tchat a dit n'importe quoi il y a moins de 3 min", () => {
    expect(isJabDue({ ...due, chatSilentFor: 179_999 }, rules)).toBe(false);
  });

  it("est due quand Fenysk n'a jamais parlé depuis le démarrage", () => {
    expect(isJabDue({ ...due, voiceSilentFor: FOREVER }, rules)).toBe(true);
  });

  it("attend l'écart entre deux piques : 10 min depuis la dernière", () => {
    expect(isJabDue({ ...due, sinceLastJab: 599_999 }, rules)).toBe(false);
    expect(isJabDue({ ...due, sinceLastJab: 600_000 }, rules)).toBe(true);
  });

  it("suit les réglages : un silence plus court, un écart plus court", () => {
    const quick: JabRules = { after: 30_000, gap: 60_000 };
    expect(
      isJabDue(
        { ...due, awayFor: 30_000, voiceSilentFor: 30_000, chatSilentFor: 30_000, sinceLastJab: 60_000 },
        quick,
      ),
    ).toBe(true);
    expect(isJabDue({ ...due, awayFor: 29_999 }, quick)).toBe(false);
  });
});

describe("toNextSilenceKind : une pique, puis un rappel", () => {
  const both = { hasJab: true, hasReminder: true };

  it("commence par la pique, puis alterne avec le rappel", () => {
    expect(toNextSilenceKind(null, both)).toBe("jab");
    expect(toNextSilenceKind("jab", both)).toBe("reminder");
    expect(toNextSilenceKind("reminder", both)).toBe("jab");
  });

  it("garde la pique seule quand il n'y a aucun rappel, comme avant", () => {
    const jabOnly = { hasJab: true, hasReminder: false };
    expect(toNextSilenceKind(null, jabOnly)).toBe("jab");
    expect(toNextSilenceKind("jab", jabOnly)).toBe("jab");
    expect(toNextSilenceKind("reminder", jabOnly)).toBe("jab");
  });

  it("dit le rappel seul quand il n'y a aucune pique", () => {
    const reminderOnly = { hasJab: false, hasReminder: true };
    expect(toNextSilenceKind(null, reminderOnly)).toBe("reminder");
    expect(toNextSilenceKind("reminder", reminderOnly)).toBe("reminder");
  });

  it("ne dit rien quand il n'y a ni pique ni rappel", () => {
    expect(toNextSilenceKind(null, { hasJab: false, hasReminder: false })).toBeNull();
    expect(toNextSilenceKind("jab", { hasJab: false, hasReminder: false })).toBeNull();
  });
});

describe("toJabRules", () => {
  const base: Settings = {
    obsAddress: "ws://127.0.0.1:4455",
    micName: "Mic/Aux",
    threshold: -40,
    delay: 250,
  };

  it("reprend le silence et l'écart des réglages", () => {
    expect(toJabRules({ ...base, foxJabAfter: 180_000, foxJabGap: 600_000 })).toEqual(rules);
  });

  it("ne donne aucune règle sans les réglages du renard", () => {
    expect(toJabRules(base)).toBeUndefined();
  });
});
