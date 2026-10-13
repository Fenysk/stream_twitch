import { describe, expect, it } from "vitest";
import { toEffectiveSettings, toNextLocal, toSettingsView } from "./settings.rules";
import { type Settings, SettingsSchema } from "./settings.schema";

const head: Settings = { obsAddress: "ws://127.0.0.1:4455", micName: "Mic/Aux", threshold: -40, delay: 250 };

const fox = {
  foxVoice: "Microsoft Claude",
  foxSmallThreshold: -38,
  foxMediumThreshold: -26,
  foxLargeChance: 0.3,
  foxBounce: 0.04,
  foxBreathPeriod: 4000,
  foxBreath: 0.015,
  foxGazeMin: 5000,
  foxGazeMax: 15000,
  foxBlinkMin: 3000,
  foxBlinkMax: 6000,
  foxBlinkDuration: 150,
  foxListenMin: 2000,
  foxListenMax: 4000,
  foxReadSilence: 1000,
  foxStopAfter: 1000,
  foxReactionDuration: 1000,
  foxJoyDuration: 800,
  foxAwayAfter: 180_000,
  foxCrouchDuration: 300,
  foxJumpDuration: 400,
  foxDiveDuration: 800,
  foxReturnDuration: 800,
  foxYawnDuration: 2000,
  foxJabAfter: 180_000,
  foxJabGap: 600_000,
  foxJabs: ["Hé, on s'ennuie là !", "Courage au tchat."],
  foxPronunciations: ["wtf = what the fuck", "fenysk = Fénisque"],
  foxShouldThank: true,
  foxThankGap: 10_000,
  foxThanksFollow: ["Merci {user} pour le follow !", "On est {viewers}."],
  foxThanksFollowGeneric: ["Merci pour tous ces follows !"],
  foxThanksSub: ["{user} s'abonne !"],
  foxThanksGiftOne: ["{user} offre un sub à {recipient} !"],
  foxThanksGiftMany: ["{user} offre {count} subs !"],
  foxThanksCheer: ["{bits} bits de {user} !"],
  foxShouldReadChat: true,
  foxShouldReadOwn: true,
  foxReadMaxLength: 150,
  foxReadGap: 10_000,
  foxReadQueueSize: 3,
  foxCapitalsMaxLength: 15,
  foxReadMaxWait: 120_000,
  foxEmoteNames: ["KEKW", "OMEGALUL"],
};

// Ce que l'interface voit du renard : tout, sauf la liste des emotes (elle reste dans settings.json).
const { foxEmoteNames: _foxEmoteNames, ...editableFox } = fox;

const defaults: Settings = { ...head, ...fox };

const issuesOf = (result: ReturnType<typeof toEffectiveSettings>) => (result.ok ? [] : result.issues);

describe("les réglages fox*", () => {
  it("sont facultatifs : settings.json sans renard reste valide", () => {
    expect(SettingsSchema.safeParse(head).success).toBe(true);
  });

  it("vont ensemble : tous, ou aucun", () => {
    expect(SettingsSchema.safeParse(defaults).success).toBe(true);
    const { foxBlinkDuration: _missing, ...partial } = defaults;
    const parsed = SettingsSchema.safeParse(partial);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe("les réglages fox* vont ensemble : tous ou aucun");
  });

  it.each(Object.keys(fox))("refusent un fichier où %s manque : ils vont ensemble", (key) => {
    const partial = Object.fromEntries(Object.entries(defaults).filter(([name]) => name !== key));
    expect(SettingsSchema.safeParse(partial).success).toBe(false);
  });

  it("veulent un second seuil de la bouche au-dessus du premier", () => {
    const result = toEffectiveSettings(defaults, { foxMediumThreshold: -38 });
    expect(issuesOf(result)).toEqual([
      { path: "foxMediumThreshold", message: "foxMediumThreshold doit dépasser foxSmallThreshold" },
    ]);
  });

  it("veulent un regard et un clignement dont le plus long ne soit pas plus court que le plus court", () => {
    expect(issuesOf(toEffectiveSettings(defaults, { foxGazeMin: 20_000 }))).toEqual([
      { path: "foxGazeMax", message: "foxGazeMax ne peut pas être plus petit que foxGazeMin" },
    ]);
    expect(issuesOf(toEffectiveSettings(defaults, { foxBlinkMin: 7000 }))).toEqual([
      { path: "foxBlinkMax", message: "foxBlinkMax ne peut pas être plus petit que foxBlinkMin" },
    ]);
  });

  it("veulent un regard d'écoute dont le plus long ne soit pas plus court que le plus court", () => {
    expect(issuesOf(toEffectiveSettings(defaults, { foxListenMin: 5000 }))).toEqual([
      { path: "foxListenMax", message: "foxListenMax ne peut pas être plus petit que foxListenMin" },
    ]);
    expect(toEffectiveSettings(defaults, { foxListenMin: 4000 }).ok).toBe(true);
  });

  it("refusent une durée nulle ou négative pour D, E, F et H, et un délai qui n'est pas un nombre", () => {
    for (const key of [
      "foxReadSilence",
      "foxStopAfter",
      "foxReactionDuration",
      "foxAwayAfter",
      "foxYawnDuration",
      "foxCrouchDuration",
      "foxJumpDuration",
      "foxDiveDuration",
      "foxReturnDuration",
    ] as const) {
      expect(issuesOf(toEffectiveSettings(defaults, { [key]: 0 }))[0]?.path, key).toBe(key);
      expect(issuesOf(toEffectiveSettings(defaults, { [key]: -1 }))[0]?.path, key).toBe(key);
    }
  });

  it("plafonnent la respiration à 3 % et le rebond à 8 % : la source laisse 96 px au-dessus du renard", () => {
    expect(issuesOf(toEffectiveSettings(defaults, { foxBounce: 0.081 }))[0]?.path).toBe("foxBounce");
    expect(issuesOf(toEffectiveSettings(defaults, { foxBreath: 0.031 }))[0]?.path).toBe("foxBreath");
    expect(toEffectiveSettings(defaults, { foxBounce: 0.08, foxBreath: 0.03 }).ok).toBe(true);
  });

  it("refusent une grande bouche hors de 0 à 1, une durée nulle, et une voix vide", () => {
    expect(issuesOf(toEffectiveSettings(defaults, { foxLargeChance: 1.1 }))[0]?.path).toBe("foxLargeChance");
    expect(issuesOf(toEffectiveSettings(defaults, { foxBreathPeriod: 0 }))[0]?.path).toBe("foxBreathPeriod");
    expect(issuesOf(toEffectiveSettings(defaults, { foxVoice: "" }))[0]?.path).toBe("foxVoice");
  });

  it("bornent la lecture du tchat : 500 caractères et 20 messages au plus, un délai strictement positif", () => {
    expect(issuesOf(toEffectiveSettings(defaults, { foxReadMaxLength: 501 }))[0]?.path).toBe(
      "foxReadMaxLength",
    );
    expect(issuesOf(toEffectiveSettings(defaults, { foxReadQueueSize: 21 }))[0]?.path).toBe(
      "foxReadQueueSize",
    );
    expect(issuesOf(toEffectiveSettings(defaults, { foxReadGap: 0 }))[0]?.path).toBe("foxReadGap");
    expect(toEffectiveSettings(defaults, { foxReadMaxLength: 500, foxReadQueueSize: 20 }).ok).toBe(true);
  });

  it("bornent les majuscules permises : au moins 1 caractère, 500 au plus", () => {
    expect(issuesOf(toEffectiveSettings(defaults, { foxCapitalsMaxLength: 0 }))[0]?.path).toBe(
      "foxCapitalsMaxLength",
    );
    expect(issuesOf(toEffectiveSettings(defaults, { foxCapitalsMaxLength: 501 }))[0]?.path).toBe(
      "foxCapitalsMaxLength",
    );
    expect(toEffectiveSettings(defaults, { foxCapitalsMaxLength: 500 }).ok).toBe(true);
  });

  it("veulent une attente maximale d'un message strictement positive", () => {
    expect(issuesOf(toEffectiveSettings(defaults, { foxReadMaxWait: 0 }))[0]?.path).toBe("foxReadMaxWait");
    expect(toEffectiveSettings(defaults, { foxReadMaxWait: 30_000 }).ok).toBe(true);
  });

  it("changent les deux interrupteurs de la lecture dans settings.local.json, sans toucher à la liste des emotes", () => {
    const local = toNextLocal({}, { foxShouldReadChat: false, foxShouldReadOwn: false });
    expect(local).toEqual({ ok: true, value: { foxShouldReadChat: false, foxShouldReadOwn: false } });
    const effective = toEffectiveSettings(defaults, local.ok ? local.value : {});
    expect(effective.ok ? effective.value.foxShouldReadChat : undefined).toBe(false);
    expect(effective.ok ? effective.value.foxEmoteNames : undefined).toEqual(["KEKW", "OMEGALUL"]);
  });

  it("changent la liste des piques dans settings.local.json, une phrase par entrée", () => {
    const local = toNextLocal({}, { foxJabs: ["Une pique", "Une autre"] });
    expect(local).toEqual({ ok: true, value: { foxJabs: ["Une pique", "Une autre"] } });
    const effective = toEffectiveSettings(defaults, local.ok ? local.value : {});
    expect(effective.ok ? effective.value.foxJabs : undefined).toEqual(["Une pique", "Une autre"]);
  });

  it("acceptent une liste de piques vide : le renard ne pique plus", () => {
    const local = toNextLocal({}, { foxJabs: [] });
    expect(local).toEqual({ ok: true, value: { foxJabs: [] } });
  });

  it("refusent une pique vide, en nommant sa ligne, et une liste qui n'est pas une liste de textes", () => {
    const empty = toNextLocal({}, { foxJabs: ["Une pique", ""] });
    expect(empty.ok ? [] : empty.issues).toEqual([{ path: "foxJabs.1", message: "ne peut pas être vide" }]);
    expect(toNextLocal({}, { foxJabs: "une seule pique" }).ok).toBe(false);
  });

  it("reprennent la liste par défaut quand la liste locale est retirée (null)", () => {
    const local = toNextLocal({ foxJabs: ["Une pique"] }, { foxJabs: null });
    expect(local).toEqual({ ok: true, value: {} });
  });

  it("changent la prononciation dans settings.local.json, une ligne « abréviation = forme dite » par mot", () => {
    const local = toNextLocal({}, { foxPronunciations: ["lol = elle o elle", "gg = gé gé"] });
    expect(local).toEqual({ ok: true, value: { foxPronunciations: ["lol = elle o elle", "gg = gé gé"] } });
  });

  it("refusent une ligne de prononciation sans « = » ou dont un côté est vide, en nommant sa ligne", () => {
    for (const bad of ["lol", "lol =", "= elle o elle", ""]) {
      const result = toNextLocal({}, { foxPronunciations: ["gg = gé gé", bad] });
      expect(result.ok, bad).toBe(false);
      expect(result.ok ? [] : result.issues[0]?.path, bad).toBe("foxPronunciations.1");
    }
    const message = toNextLocal({}, { foxPronunciations: ["lol"] });
    expect(message.ok ? "" : message.issues[0]?.message).toBe("doit s'écrire « abréviation = forme dite »");
  });

  it("acceptent une prononciation vide : plus rien n'est remplacé", () => {
    expect(toNextLocal({}, { foxPronunciations: [] }).ok).toBe(true);
  });

  it("refusent un silence ou un écart nul pour la relance", () => {
    expect(issuesOf(toEffectiveSettings(defaults, { foxJabAfter: 0 }))[0]?.path).toBe("foxJabAfter");
    expect(issuesOf(toEffectiveSettings(defaults, { foxJabGap: -1 }))[0]?.path).toBe("foxJabGap");
  });

  it("refusent la liste des emotes dans settings.local.json : elle reste dans settings.json", () => {
    const local = toNextLocal({}, { foxEmoteNames: "KEKW" });
    expect(local.ok).toBe(false);
  });

  it("se règlent dans settings.local.json, devant les valeurs par défaut", () => {
    const local = toNextLocal({}, { foxVoice: "Microsoft Hortense", foxBounce: 0.06 });
    expect(local).toEqual({ ok: true, value: { foxVoice: "Microsoft Hortense", foxBounce: 0.06 } });
    const effective = toEffectiveSettings(defaults, local.ok ? local.value : {});
    expect(effective.ok ? effective.value.foxVoice : undefined).toBe("Microsoft Hortense");
    expect(effective.ok ? effective.value.foxBounce : undefined).toBe(0.06);
    expect(effective.ok ? effective.value.foxGazeMin : undefined).toBe(5000);
  });

  it("reprennent leur valeur par défaut quand le réglage local est retiré (null)", () => {
    const local = toNextLocal({ foxBounce: 0.06, foxBreath: 0.02 }, { foxBounce: null });
    expect(local).toEqual({ ok: true, value: { foxBreath: 0.02 } });
  });

  it("passent à l'interface avec ceux de la tête, et seulement eux", () => {
    const view = toSettingsView({ defaults, local: {}, effective: defaults });
    expect(view.effective).toEqual({ threshold: -40, ...editableFox });
    expect(view.effective).not.toHaveProperty("foxEmoteNames");
    expect(view.effective).not.toHaveProperty("obsAddress");
    expect(toSettingsView({ defaults: head, local: {}, effective: head }).effective).toEqual({
      threshold: -40,
    });
  });
});
