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
  foxEmoteReactions: ["LUL = sourire", "WutFace = choc", "Kappa = clin"],
  foxJoyDuration: 800,
  foxAwayAfter: 180_000,
  foxCrouchDuration: 300,
  foxJumpDuration: 400,
  foxDiveDuration: 800,
  foxReturnDuration: 800,
  foxYawnDuration: 2000,
  foxRaidDuration: 3000,
  foxJabAfter: 180_000,
  foxJabGap: 600_000,
  foxJabs: ["Hé, on s'ennuie là !", "Courage au tchat."],
  foxReminders: ["Venez dessiner sur LivePlace !"],
  foxShoutThreshold: -5,
  foxShoutMerge: 1000,
  foxShoutCount: 3,
  foxShoutPeriod: 120_000,
  foxShoutLong: 3000,
  foxShoutGap: 600_000,
  foxShouts: ["Doucement !"],
  foxTunnelAfter: 180_000,
  foxTunnelPause: 5000,
  foxTunnelGap: 600_000,
  foxTunnelToFenysk: ["Tu respires, des fois ?"],
  foxTunnelToChat: ["Je crois que Fenysk nous tunnel."],
  foxShouldHailComeback: true,
  foxComebackAfter: 300_000,
  foxComebackToFenysk: ["Re, Fenysk. Tu t'es perdu en route ?"],
  foxComebackToChat: ["Ah, il est de retour le boug !"],
  foxBalanceMargin: 0,
  foxBalanceAfter: 10_000,
  foxBalanceGap: 300_000,
  foxBalanceAlerts: ["Fenysk, le jeu parle plus fort que toi !"],
  foxStartleRise: 20,
  foxStartleWithin: 300,
  foxStartleLevel: -15,
  foxStartleGap: 30_000,
  foxHourPhrases: ["{heures} de live."],
  foxEndAt: "",
  foxEndWarningMarks: ["60", "30", "15", "10", "5", "2", "1"],
  foxEndWarningPhrases: ["Plus que {minutes} minutes."],
  foxEndSoonPhrases: ["Plus que {reste} !"],
  foxEndPanicPhrases: ["{reste} !"],
  foxEndPhrases: ["C'est l'heure !"],
  foxOvertimeGap: 600_000,
  foxOvertimePhrases: ["Il est {maintenant}."],
  foxBedtimePhrases: ["Je vais me coucher."],
  foxLateAfter: "23:30",
  foxLateYawnMin: 300_000,
  foxLateYawnMax: 600_000,
  foxShouldReviewAtEnd: true,
  foxPronunciations: ["wtf = what the fuck", "fenysk = Fénisque"],
  foxShouldThank: true,
  foxThankGap: 10_000,
  foxThanksFollow: ["Merci {user} pour le follow !", "On est {viewers}."],
  foxThanksFollowGeneric: ["Merci pour tous ces follows !"],
  foxThanksSub: ["{user} s'abonne !"],
  foxThanksGiftOne: ["{user} offre un sub à {recipient} !"],
  foxThanksGiftMany: ["{user} offre {count} subs !"],
  foxThanksCheer: ["{bits} bits de {user} !"],
  foxThanksLurk: ["Merci pour le lurk, {user}."],
  foxThanksLurkGeneric: ["Merci pour le lurk !"],
  foxTalkativeMessages: 50,
  foxThanksTalkative: ["{user}, {messages} messages !"],
  foxThanksRaid: ["{user} débarque avec {viewers}."],
  foxThanksRaidGeneric: ["Un raid ! {viewers} d'un coup."],
  foxClashRewards: ["Clasher Fenysk"],
  foxClashIntros: ["{user} m'a payé pour te dire ça :"],
  foxWakeRewards: ["Réveiller Jean-Renard"],
  foxThanksWakeAsleep: ["Quoi ?! Je dormais, moi !"],
  foxThanksWakeAwake: ["Je dors pas, {user}. Je réfléchis."],
  foxThanksPrediction: ["Perdants sur « {issue} » : {perdants}. Courage."],
  foxThanksPredictionNoLoser: ["Tout le monde a gagné. C'est louche."],
  foxShouldWelcome: true,
  foxWelcomeLiveGap: 21_600_000,
  foxWelcomeLiveCounts: ["10", "25", "50", "100"],
  foxWelcomeReturnAfter: 1_209_600_000,
  foxWelcomeMilestone: ["{user} ! {lives}e live."],
  foxWelcomeReturn: ["{user} ! {absence} sans nouvelles."],
  foxWelcomeYesterday: ["Oh, {user}, tu étais là hier !"],
  foxWelcomeFirst: ["Un nouveau ! Bienvenue, {user}."],
  foxCheerfulCount: 15,
  foxCheerfulPeriod: 300_000,
  foxSulkAfter: 90_000,
  foxResumeAfter: 300_000,
  foxResumePhrases: ["Ah, maintenant vous parlez ?"],
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
      "foxRaidDuration",
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

  it("changent la liste des rappels dans settings.local.json, et la laissent vide pour que la pique reste seule", () => {
    expect(toNextLocal({}, { foxReminders: ["Suivez-moi !"] })).toEqual({
      ok: true,
      value: { foxReminders: ["Suivez-moi !"] },
    });
    expect(toNextLocal({}, { foxReminders: [] }).ok).toBe(true);
    const empty = toNextLocal({}, { foxReminders: ["Suivez-moi !", ""] });
    expect(empty.ok ? [] : empty.issues).toEqual([
      { path: "foxReminders.1", message: "ne peut pas être vide" },
    ]);
  });

  it("règlent le cri : un seuil de 0 dB au plus, des durées et un nombre strictement positifs", () => {
    expect(issuesOf(toEffectiveSettings(defaults, { foxShoutThreshold: 1 }))[0]?.path).toBe(
      "foxShoutThreshold",
    );
    for (const key of [
      "foxShoutMerge",
      "foxShoutCount",
      "foxShoutPeriod",
      "foxShoutLong",
      "foxShoutGap",
    ] as const) {
      expect(issuesOf(toEffectiveSettings(defaults, { [key]: 0 }))[0]?.path, key).toBe(key);
    }
    expect(toEffectiveSettings(defaults, { foxShoutThreshold: 0, foxShoutCount: 1 }).ok).toBe(true);
  });

  it("règlent le tunnel : une durée, une pause et un écart strictement positifs", () => {
    for (const key of ["foxTunnelAfter", "foxTunnelPause", "foxTunnelGap"] as const) {
      expect(issuesOf(toEffectiveSettings(defaults, { [key]: 0 }))[0]?.path, key).toBe(key);
    }
    expect(toEffectiveSettings(defaults, { foxTunnelAfter: 30_000, foxTunnelPause: 1000 }).ok).toBe(true);
  });

  it("règlent le retour : une durée d'absence strictement positive, une case vrai ou faux", () => {
    expect(issuesOf(toEffectiveSettings(defaults, { foxComebackAfter: 0 }))[0]?.path).toBe(
      "foxComebackAfter",
    );
    expect(toEffectiveSettings(defaults, { foxComebackAfter: 60_000 }).ok).toBe(true);
    expect(toNextLocal({}, { foxShouldHailComeback: "oui" }).ok).toBe(false);
    const local = toNextLocal({}, { foxShouldHailComeback: false });
    expect(local).toEqual({ ok: true, value: { foxShouldHailComeback: false } });
  });

  it("changent les deux listes du retour dans settings.local.json, chacune pouvant être vide", () => {
    const local = toNextLocal({}, { foxComebackToFenysk: ["T'étais où ?"], foxComebackToChat: [] });
    expect(local).toEqual({
      ok: true,
      value: { foxComebackToFenysk: ["T'étais où ?"], foxComebackToChat: [] },
    });
    const empty = toNextLocal({}, { foxComebackToChat: [""] });
    expect(empty.ok ? [] : empty.issues).toEqual([
      { path: "foxComebackToChat.0", message: "ne peut pas être vide" },
    ]);
  });

  it("règlent la balance : un écart de -20 à 20 dB, une durée et un écart strictement positifs", () => {
    expect(issuesOf(toEffectiveSettings(defaults, { foxBalanceMargin: 21 }))[0]?.path).toBe(
      "foxBalanceMargin",
    );
    expect(issuesOf(toEffectiveSettings(defaults, { foxBalanceMargin: -21 }))[0]?.path).toBe(
      "foxBalanceMargin",
    );
    expect(toEffectiveSettings(defaults, { foxBalanceMargin: -20 }).ok).toBe(true);
    expect(toEffectiveSettings(defaults, { foxBalanceMargin: 20 }).ok).toBe(true);
    for (const key of ["foxBalanceAfter", "foxBalanceGap"] as const) {
      expect(issuesOf(toEffectiveSettings(defaults, { [key]: 0 }))[0]?.path, key).toBe(key);
    }
  });

  it("règlent le sursaut du jeu : une hausse de 0 à 100 dB, un level de -100 à 0 dB, un temps et un écart strictement positifs", () => {
    for (const key of ["foxStartleRise", "foxStartleWithin", "foxStartleGap"] as const) {
      expect(issuesOf(toEffectiveSettings(defaults, { [key]: 0 }))[0]?.path, key).toBe(key);
    }
    expect(issuesOf(toEffectiveSettings(defaults, { foxStartleRise: 101 }))[0]?.path).toBe("foxStartleRise");
    expect(issuesOf(toEffectiveSettings(defaults, { foxStartleLevel: 1 }))[0]?.path).toBe("foxStartleLevel");
    expect(issuesOf(toEffectiveSettings(defaults, { foxStartleLevel: -101 }))[0]?.path).toBe(
      "foxStartleLevel",
    );
    expect(toEffectiveSettings(defaults, { foxStartleRise: 12.5, foxStartleLevel: 0 }).ok).toBe(true);
  });

  it("règlent l'humeur du tchat : des nombres et des durées strictement positifs, des phrases de reprise qui peuvent manquer", () => {
    for (const key of ["foxCheerfulCount", "foxCheerfulPeriod", "foxSulkAfter", "foxResumeAfter"] as const) {
      expect(issuesOf(toEffectiveSettings(defaults, { [key]: 0 }))[0]?.path, key).toBe(key);
      expect(issuesOf(toEffectiveSettings(defaults, { [key]: 1.5 }))[0]?.path, key).toBe(key);
    }
    expect(issuesOf(toEffectiveSettings(defaults, { foxResumePhrases: [""] }))[0]?.path).toBe(
      "foxResumePhrases.0",
    );
    expect(toEffectiveSettings(defaults, { foxResumePhrases: [] }).ok).toBe(true);
    expect(toEffectiveSettings(defaults, { foxCheerfulCount: 20, foxSulkAfter: 60_000 }).ok).toBe(true);
  });

  it("règlent les emotes qui changent sa tête : une ligne « nom = sourire, choc ou clin » par emote", () => {
    expect(
      issuesOf(toEffectiveSettings(defaults, { foxEmoteReactions: ["LUL = sourire", "Kappa = triste"] })),
    ).toEqual([
      {
        path: "foxEmoteReactions.1",
        message: "doit s'écrire « nom de l'emote = sourire, choc ou clin »",
      },
    ]);
    for (const line of ["LUL", "= sourire", "deux mots = choc", ""]) {
      expect(issuesOf(toEffectiveSettings(defaults, { foxEmoteReactions: [line] }))[0]?.path, line).toBe(
        "foxEmoteReactions.0",
      );
    }
    expect(toEffectiveSettings(defaults, { foxEmoteReactions: [] }).ok).toBe(true);
    expect(toEffectiveSettings(defaults, { foxEmoteReactions: ["PogU = clin d'œil"] }).ok).toBe(true);
  });

  it("règlent le viewer très impliqué : un nombre de messages entier strictement positif, une phrase au moins", () => {
    expect(issuesOf(toEffectiveSettings(defaults, { foxTalkativeMessages: 0 }))[0]?.path).toBe(
      "foxTalkativeMessages",
    );
    expect(issuesOf(toEffectiveSettings(defaults, { foxTalkativeMessages: 12.5 }))[0]?.path).toBe(
      "foxTalkativeMessages",
    );
    expect(issuesOf(toEffectiveSettings(defaults, { foxThanksTalkative: [] }))[0]?.path).toBe(
      "foxThanksTalkative",
    );
    expect(toEffectiveSettings(defaults, { foxTalkativeMessages: 100 }).ok).toBe(true);
  });

  it("règlent les prédictions : au moins une phrase dans chacune des deux listes", () => {
    for (const key of ["foxThanksPrediction", "foxThanksPredictionNoLoser"] as const) {
      expect(issuesOf(toEffectiveSettings(defaults, { [key]: [] }))[0]?.path, key).toBe(key);
      expect(issuesOf(toEffectiveSettings(defaults, { [key]: [""] }))[0]?.path, key).toBe(`${key}.0`);
    }
    expect(toEffectiveSettings(defaults, { foxThanksPrediction: ["{perdants} sur {issue}."] }).ok).toBe(true);
  });

  it("règlent les raids : au moins une phrase dans chacune des deux listes", () => {
    for (const key of ["foxThanksRaid", "foxThanksRaidGeneric"] as const) {
      expect(issuesOf(toEffectiveSettings(defaults, { [key]: [] }))[0]?.path, key).toBe(key);
      expect(issuesOf(toEffectiveSettings(defaults, { [key]: [""] }))[0]?.path, key).toBe(`${key}.0`);
    }
    expect(toEffectiveSettings(defaults, { foxThanksRaid: ["Bienvenue {user} !"] }).ok).toBe(true);
  });

  it("règlent les récompenses de points de chaîne : des titres qui peuvent manquer, au moins une phrase d'intro et de réveil", () => {
    for (const key of ["foxClashIntros", "foxThanksWakeAsleep", "foxThanksWakeAwake"] as const) {
      expect(issuesOf(toEffectiveSettings(defaults, { [key]: [] }))[0]?.path, key).toBe(key);
      expect(issuesOf(toEffectiveSettings(defaults, { [key]: [""] }))[0]?.path, key).toBe(`${key}.0`);
    }
    for (const key of ["foxClashRewards", "foxWakeRewards"] as const) {
      expect(issuesOf(toEffectiveSettings(defaults, { [key]: [""] }))[0]?.path, key).toBe(`${key}.0`);
      expect(toEffectiveSettings(defaults, { [key]: [] }).ok, key).toBe(true);
      expect(toEffectiveSettings(defaults, { [key]: ["Un titre", "Un autre"] }).ok, key).toBe(true);
    }
  });

  it("règlent l'accueil des habitués : un silence et une absence strictement positifs, des nombres de lives entiers, des phrases qui peuvent manquer", () => {
    for (const key of ["foxWelcomeLiveGap", "foxWelcomeReturnAfter"] as const) {
      expect(issuesOf(toEffectiveSettings(defaults, { [key]: 0 }))[0]?.path, key).toBe(key);
    }
    expect(issuesOf(toEffectiveSettings(defaults, { foxWelcomeLiveCounts: ["10", "dix"] }))[0]?.path).toBe(
      "foxWelcomeLiveCounts.1",
    );
    for (const line of ["0", "-5", "1,5", ""]) {
      expect(issuesOf(toEffectiveSettings(defaults, { foxWelcomeLiveCounts: [line] }))[0]?.path, line).toBe(
        "foxWelcomeLiveCounts.0",
      );
    }
    expect(issuesOf(toEffectiveSettings(defaults, { foxWelcomeReturn: [""] }))[0]?.path).toBe(
      "foxWelcomeReturn.0",
    );
    expect(
      toEffectiveSettings(defaults, {
        foxWelcomeLiveCounts: [],
        foxWelcomeMilestone: [],
        foxWelcomeReturn: [],
        foxWelcomeYesterday: [],
        foxWelcomeFirst: [],
      }).ok,
    ).toBe(true);
  });

  it("règlent l'heure du live : des durées strictement positives, les bâillements tardifs du plus court au plus long", () => {
    for (const key of ["foxOvertimeGap", "foxLateYawnMin", "foxLateYawnMax"] as const) {
      expect(issuesOf(toEffectiveSettings(defaults, { [key]: 0 }))[0]?.path, key).toBe(key);
    }
    expect(issuesOf(toEffectiveSettings(defaults, { foxLateYawnMin: 700_000 }))).toEqual([
      {
        path: "foxLateYawnMax",
        message: "foxLateYawnMax ne peut pas être plus petit que foxLateYawnMin",
      },
    ]);
    expect(toEffectiveSettings(defaults, { foxLateYawnMin: 600_000 }).ok).toBe(true);
  });

  it("veulent des paliers d'avertissement entiers : un nombre de minutes de 1 ou plus par ligne, ou aucun", () => {
    expect(toEffectiveSettings(defaults, { foxEndWarningMarks: ["60", "30", "1"] }).ok).toBe(true);
    expect(toEffectiveSettings(defaults, { foxEndWarningMarks: [] }).ok).toBe(true);
    expect(issuesOf(toEffectiveSettings(defaults, { foxEndWarningMarks: ["30", "bientôt"] }))[0]?.path).toBe(
      "foxEndWarningMarks.1",
    );
    for (const line of ["0", "-5", "1,5", "", " 5"]) {
      expect(issuesOf(toEffectiveSettings(defaults, { foxEndWarningMarks: [line] }))[0]?.path, line).toBe(
        "foxEndWarningMarks.0",
      );
    }
    expect(issuesOf(toEffectiveSettings(defaults, { foxEndWarningMarks: ["x"] }))[0]?.message).toBe(
      "chaque ligne doit être un nombre entier de minutes, 1 ou plus",
    );
  });

  it("refusent l'ancien curseur foxEndWarning : le réglage n'existe plus", () => {
    const local = toNextLocal({}, { foxEndWarning: 1_800_000 });
    expect(local.ok).toBe(false);
    expect(SettingsSchema.safeParse({ ...head, foxEndWarning: 1_800_000 }).success).toBe(false);
  });

  it("veulent une fin prévue qui est un instant ISO avec sa date, ou vide pour n'en avoir aucune", () => {
    for (const time of [
      "",
      "2026-10-16T13:00:00.000Z",
      "2026-10-16T13:00:00Z",
      "2026-10-16T15:00:00+02:00",
    ]) {
      expect(toEffectiveSettings(defaults, { foxEndAt: time }).ok, time).toBe(true);
    }
    for (const time of [
      "15:00",
      "2026-10-16",
      "2026-10-16T13:00",
      "2026-13-16T13:00:00Z",
      "minuit",
      " 2026-10-16T13:00:00Z",
    ]) {
      expect(issuesOf(toEffectiveSettings(defaults, { foxEndAt: time }))[0]?.path, time).toBe("foxEndAt");
    }
  });

  it("refusent l'ancien réglage foxEndTime (HH:MM) : il n'existe plus, un settings.local.json qui le garde est converti avant d'être lu", () => {
    expect(toNextLocal({}, { foxEndTime: "15:00" }).ok).toBe(false);
    expect(SettingsSchema.safeParse({ ...head, foxEndTime: "15:00" }).success).toBe(false);
  });

  it("veulent une heure des bâillements tardifs HH:MM, jamais vide", () => {
    expect(toEffectiveSettings(defaults, { foxLateAfter: "22:45" }).ok).toBe(true);
    for (const time of ["", "25:00", "tard"]) {
      expect(issuesOf(toEffectiveSettings(defaults, { foxLateAfter: time }))[0]?.path, time).toBe(
        "foxLateAfter",
      );
    }
  });

  it("changent les sept listes de l'heure du live dans settings.local.json, chacune pouvant être vide", () => {
    const keys = [
      "foxHourPhrases",
      "foxEndWarningPhrases",
      "foxEndSoonPhrases",
      "foxEndPanicPhrases",
      "foxEndPhrases",
      "foxOvertimePhrases",
      "foxBedtimePhrases",
    ] as const;
    for (const key of keys) {
      expect(toNextLocal({}, { [key]: ["Une phrase"] }).ok, key).toBe(true);
      expect(toNextLocal({}, { [key]: [] }).ok, key).toBe(true);
      expect(toNextLocal({}, { [key]: [""] }).ok, key).toBe(false);
    }
  });

  it("changent la liste des alertes du son dans settings.local.json, et la laissent vide pour qu'il se taise", () => {
    expect(toNextLocal({}, { foxBalanceAlerts: ["Le jeu couvre ta voix !"] }).ok).toBe(true);
    expect(toNextLocal({}, { foxBalanceAlerts: [] }).ok).toBe(true);
    expect(toNextLocal({}, { foxBalanceAlerts: [""] }).ok).toBe(false);
  });

  it("choisissent la source du son du PC dans settings.json seulement : un nom non vide, pas dans l'interface", () => {
    expect(SettingsSchema.safeParse({ ...head, desktopName: "Audio du bureau" }).success).toBe(true);
    expect(SettingsSchema.safeParse({ ...head, desktopName: "" }).success).toBe(false);
    expect(SettingsSchema.safeParse(head).success).toBe(true);
    const local = toNextLocal({}, { desktopName: "Autre" });
    expect(local.ok ? [] : local.issues).toEqual([
      { path: "desktopName", message: "ce réglage ne se change pas ici, il reste dans settings.json" },
    ]);
    const view = toSettingsView({
      defaults: { ...defaults, desktopName: "Audio du bureau" },
      local: {},
      effective: { ...defaults, desktopName: "Audio du bureau" },
    });
    expect(view.effective).not.toHaveProperty("desktopName");
  });

  it("changent les deux listes du tunnel dans settings.local.json, chacune pouvant être vide", () => {
    const local = toNextLocal({}, { foxTunnelToFenysk: ["Tu respires ?"], foxTunnelToChat: [] });
    expect(local).toEqual({ ok: true, value: { foxTunnelToFenysk: ["Tu respires ?"], foxTunnelToChat: [] } });
    const empty = toNextLocal({}, { foxTunnelToChat: [""] });
    expect(empty.ok ? [] : empty.issues).toEqual([
      { path: "foxTunnelToChat.0", message: "ne peut pas être vide" },
    ]);
  });

  it("changent la liste des phrases de cri dans settings.local.json, et la laissent vide pour qu'il se taise", () => {
    const local = toNextLocal({}, { foxShouts: ["Aïe !", "Mes oreilles !"] });
    expect(local).toEqual({ ok: true, value: { foxShouts: ["Aïe !", "Mes oreilles !"] } });
    expect(toNextLocal({}, { foxShouts: [] }).ok).toBe(true);
    const empty = toNextLocal({}, { foxShouts: ["Aïe !", ""] });
    expect(empty.ok ? [] : empty.issues).toEqual([{ path: "foxShouts.1", message: "ne peut pas être vide" }]);
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
