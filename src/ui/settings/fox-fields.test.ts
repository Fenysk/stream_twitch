import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SettingsFieldsSchema } from "../../domain/settings.schema";
import { CHAT_SLIDERS } from "./chat-fields";
import {
  FOX_GROUPS,
  FOX_KEYS,
  FOX_LISTS,
  FOX_READ_SLIDERS,
  FOX_SLIDER_KEYS,
  FOX_SLIDERS,
  FOX_TIMES,
  FOX_TOGGLES,
} from "./fox-fields";
import { SLIDER_KEYS } from "./head-fields";
import { isDefaultTab, toChanges, toFieldErrors } from "./settings-changes";

// Les réglages de chaque onglet, comme les onglets les désignent à « Revenir aux valeurs par défaut » : la tête (ses six
// curseurs et l'expression), le tchat (ses quatre curseurs, deux choix et une case), le renard (ses cinquante-huit curseurs, ses vingt-huit listes, ses deux heures, la voix et cinq cases).
const HEAD_KEYS = [...SLIDER_KEYS, "expression"];
const CHAT_KEYS = [
  ...CHAT_SLIDERS.map(({ key }) => key),
  "chatStyle",
  "chatAnimation",
  "chatShouldShowHidden",
];

const defaults: Record<string, unknown> = JSON.parse(readFileSync("settings.json", "utf8"));

const spec = (key: string) => {
  const found = FOX_SLIDERS.find((slider) => slider.key === key);
  if (!found) throw new Error(`curseur absent : ${key}`);
  return found;
};
const labelsOf = (key: string): string[] => spec(key).steps.map(({ label }) => label);
const valuesOf = (key: string): number[] => spec(key).steps.map(({ value }) => value);

describe("les curseurs de l'onglet Renard", () => {
  it("sont cinquante-huit : cinquante-trois pour l'animation en seize groupes, cinq pour la lecture du tchat", () => {
    expect(FOX_GROUPS.map(({ title }) => title)).toEqual([
      "Quand il parle",
      "Au repos",
      "Clignement",
      "Quand tu parles",
      "Réaction et coucou",
      "Habitués",
      "Humeur du tchat",
      "Quand il s'ennuie",
      "Relance",
      "Remerciements",
      "Quand tu cries",
      "Quand tu parles longtemps",
      "Balance du son",
      "Quand le jeu explose",
      "Heure du live",
      "Prononciation",
    ]);
    expect(FOX_SLIDER_KEYS).toEqual([
      "foxSmallThreshold",
      "foxMediumThreshold",
      "foxLargeChance",
      "foxBounce",
      "foxBreathPeriod",
      "foxBreath",
      "foxGazeMin",
      "foxGazeMax",
      "foxBlinkMin",
      "foxBlinkMax",
      "foxBlinkDuration",
      "foxListenMin",
      "foxListenMax",
      "foxReadSilence",
      "foxStopAfter",
      "foxReactionDuration",
      "foxWelcomeLiveGap",
      "foxWelcomeReturnAfter",
      "foxCheerfulCount",
      "foxCheerfulPeriod",
      "foxSulkAfter",
      "foxResumeAfter",
      "foxAwayAfter",
      "foxYawnDuration",
      "foxCrouchDuration",
      "foxJumpDuration",
      "foxDiveDuration",
      "foxReturnDuration",
      "foxJabAfter",
      "foxJabGap",
      "foxThankGap",
      "foxJoyDuration",
      "foxTalkativeMessages",
      "foxShoutThreshold",
      "foxShoutMerge",
      "foxShoutCount",
      "foxShoutPeriod",
      "foxShoutLong",
      "foxShoutGap",
      "foxTunnelAfter",
      "foxTunnelPause",
      "foxTunnelGap",
      "foxBalanceMargin",
      "foxBalanceAfter",
      "foxBalanceGap",
      "foxStartleRise",
      "foxStartleWithin",
      "foxStartleLevel",
      "foxStartleGap",
      "foxEndWarning",
      "foxOvertimeGap",
      "foxLateYawnMin",
      "foxLateYawnMax",
      "foxReadMaxLength",
      "foxCapitalsMaxLength",
      "foxReadGap",
      "foxReadQueueSize",
      "foxReadMaxWait",
    ]);
    expect(FOX_READ_SLIDERS.map(({ key }) => key)).toEqual([
      "foxReadMaxLength",
      "foxCapitalsMaxLength",
      "foxReadGap",
      "foxReadQueueSize",
      "foxReadMaxWait",
    ]);
  });

  it("règlent la lecture du tchat : la longueur de 20 à 300 caractères, le délai de 1 à 60 s, la file de 1 à 10", () => {
    expect(labelsOf("foxReadMaxLength").slice(0, 2)).toEqual(["20 caractères", "30 caractères"]);
    expect(labelsOf("foxReadMaxLength").at(-1)).toBe("300 caractères");
    expect(labelsOf("foxReadGap").slice(0, 2)).toEqual(["1 s", "2 s"]);
    expect(labelsOf("foxReadGap").at(-1)).toBe("60 s");
    expect(valuesOf("foxReadGap")).toContain(10_000);
    expect(valuesOf("foxReadQueueSize")).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("règlent les majuscules permises de 5 à 60 caractères, par pas de 5", () => {
    expect(labelsOf("foxCapitalsMaxLength").slice(0, 2)).toEqual(["5 caractères", "10 caractères"]);
    expect(labelsOf("foxCapitalsMaxLength").at(-1)).toBe("60 caractères");
    expect(valuesOf("foxCapitalsMaxLength")).toContain(15);
  });

  it("règlent l'attente d'un message de 30 s à 10 min, avec 2 min au milieu", () => {
    expect(labelsOf("foxReadMaxWait").slice(0, 3)).toEqual(["30 s", "1 min", "1,5 min"]);
    expect(labelsOf("foxReadMaxWait").at(-1)).toBe("10 min");
    expect(valuesOf("foxReadMaxWait")).toContain(120_000);
  });

  it("règlent chaque durée et chaque seuil de A, B et C : les 2 seuils, la grande bouche, le rebond, la respiration, le regard, le clignement", () => {
    expect(FOX_SLIDERS.map(({ label }) => label)).toEqual([
      "Seuil de la petite bouche",
      "Seuil de la bouche moyenne",
      "Grande bouche",
      "Rebond",
      "Respiration : durée",
      "Respiration : étirement",
      "Regard : au plus court",
      "Regard : au plus long",
      "Entre deux clignements : minimum",
      "Entre deux clignements : maximum",
      "Durée du clignement",
      "Écoute : regard au plus court",
      "Écoute : regard au plus long",
      "Silence avant de lire",
      "Coupure quand tu parles",
      "Durée de la réaction, du coucou et du sursaut",
      "Silence entre deux lives",
      "Absence avant « sans nouvelles »",
      "Messages pour être joyeux",
      "Période de ces messages",
      "Silence du tchat avant qu'il boude",
      "Silence du tchat avant la reprise",
      "Délai avant de partir",
      "Durée du bâillement",
      "Durée de l'accroupissement",
      "Durée du saut",
      "Durée du plongeon",
      "Durée du saut pour revenir",
      "Silence avant de revenir piquer Fenysk",
      "Écart entre deux piques",
      "Un follow nommé toutes les",
      "Durée du saut de joie",
      "Messages d'un viewer très impliqué",
      "Seuil d'un cri",
      "Cris collés : écart maximum",
      "Nombre de cris avant une phrase",
      "Période de ces cris",
      "Durée d'un cri pénible",
      "Écart entre deux phrases de cri",
      "Durée avant qu'il bâille",
      "Silence qui coupe ce monologue",
      "Écart entre deux monologues",
      "Écart du jeu sur ta voix",
      "Durée du jeu trop fort",
      "Écart entre deux alertes",
      "Hausse du son du PC",
      "Durée de cette hausse",
      "Level du son à dépasser",
      "Écart entre deux sursauts",
      "Avertissement avant la fin",
      "Écart entre deux rappels de fin",
      "Bâillement tardif : au plus tôt",
      "Bâillement tardif : au plus tard",
      "Longueur d'un message lu",
      "Majuscules permises jusqu'à",
      "Un message par viewer toutes les",
      "Messages en attente",
      "Attente d'un message au plus",
    ]);
  });

  it("ont chacun une aide courte, de sept mots au plus", () => {
    for (const { help } of FOX_SLIDERS) {
      expect(help.length).toBeGreaterThan(0);
      expect(help.split(/\s+/).length).toBeLessThanOrEqual(7);
    }
  });

  it("règlent les seuils de -60 à 0 dB par pas de 1", () => {
    expect(spec("foxSmallThreshold").steps).toHaveLength(61);
    expect(labelsOf("foxMediumThreshold").at(0)).toBe("-60 dB");
    expect(labelsOf("foxMediumThreshold").at(-1)).toBe("0 dB");
  });

  it("écrivent les durées en secondes à la française, et le clignement en ms", () => {
    expect(labelsOf("foxBreathPeriod").slice(0, 3)).toEqual(["2 s", "2,25 s", "2,5 s"]);
    expect(labelsOf("foxGazeMax").at(-1)).toBe("30 s");
    expect(labelsOf("foxBlinkDuration").slice(0, 2)).toEqual(["50 ms", "60 ms"]);
    expect(labelsOf("foxBlinkDuration").at(-1)).toBe("500 ms");
  });

  it("écrivent les fractions du corps en pourcentage, la valeur restant une fraction", () => {
    expect(valuesOf("foxBounce").slice(0, 3)).toEqual([0, 0.005, 0.01]);
    expect(labelsOf("foxBounce").slice(0, 3)).toEqual(["0 %", "0,5 %", "1 %"]);
    expect(labelsOf("foxBreath").at(-1)).toBe("3 %");
    expect(valuesOf("foxLargeChance").at(-1)).toBe(1);
    expect(labelsOf("foxLargeChance")[6]).toBe("30 %");
  });

  it("n'offrent que des valeurs que settings.json accepte, champ par champ", () => {
    for (const { key, steps } of FOX_SLIDERS) {
      const field = SettingsFieldsSchema.shape[key];
      for (const { value } of steps) {
        expect(field.safeParse(value).success, `${key} = ${value}`).toBe(true);
      }
    }
  });

  it("ont un cran pour chaque valeur par défaut de settings.json : le curseur la montre exactement", () => {
    for (const { key } of FOX_SLIDERS) {
      expect(valuesOf(key), key).toContain(defaults[key]);
    }
  });

  it("ont pour repli la valeur par défaut de settings.json : les deux ne se séparent pas", () => {
    for (const { key, fallback } of FOX_SLIDERS) {
      expect(fallback, key).toBe(defaults[key]);
    }
  });

  it("règlent D, E, F, G et H : l'écoute, le silence et la coupure, la réaction, le délai de 30 s à 10 min, le bâillement, la descente et le saut", () => {
    expect(labelsOf("foxListenMin").slice(0, 2)).toEqual(["1 s", "1,25 s"]);
    expect(labelsOf("foxListenMax").at(-1)).toBe("10 s");
    expect(valuesOf("foxReadSilence")).toContain(1000);
    expect(valuesOf("foxStopAfter")).toContain(1000);
    expect(labelsOf("foxReactionDuration").at(-1)).toBe("3 s");
    expect(labelsOf("foxAwayAfter").slice(0, 3)).toEqual(["30 s", "1 min", "1,5 min"]);
    expect(labelsOf("foxAwayAfter").at(-1)).toBe("10 min");
    expect(valuesOf("foxAwayAfter")).toContain(180_000);
    expect(labelsOf("foxAwayAfter")[5]).toBe("3 min");
    expect(valuesOf("foxYawnDuration")).toContain(2000);
    expect(valuesOf("foxCrouchDuration")).toContain(300);
    expect(valuesOf("foxJumpDuration")).toContain(400);
    expect(valuesOf("foxDiveDuration")).toContain(800);
    expect(labelsOf("foxReturnDuration")[6]).toBe("0,8 s");
    expect(valuesOf("foxReturnDuration")).toContain(800);
  });

  it("laissent la place des 96 px au-dessus du renard : la respiration et le rebond pris ensemble tiennent", () => {
    const maxBounce = valuesOf("foxBounce").at(-1) ?? 0;
    const maxBreath = valuesOf("foxBreath").at(-1) ?? 0;
    expect((1 + maxBounce) * (1 + maxBreath) - 1).toBeLessThanOrEqual(96 / 817);
  });
});

describe("les listes de phrases de l'onglet Renard", () => {
  it("sont celles des groupes : les piques, les rappels, les phrases de cri et les autres, une phrase par ligne", () => {
    expect(FOX_LISTS.map(({ key }) => key)).toEqual([
      "foxEmoteReactions",
      "foxWelcomeLiveCounts",
      "foxWelcomeMilestone",
      "foxWelcomeReturn",
      "foxWelcomeYesterday",
      "foxWelcomeFirst",
      "foxResumePhrases",
      "foxJabs",
      "foxReminders",
      "foxThanksFollow",
      "foxThanksFollowGeneric",
      "foxThanksSub",
      "foxThanksGiftOne",
      "foxThanksGiftMany",
      "foxThanksCheer",
      "foxThanksLurk",
      "foxThanksLurkGeneric",
      "foxThanksTalkative",
      "foxShouts",
      "foxTunnelToFenysk",
      "foxTunnelToChat",
      "foxBalanceAlerts",
      "foxHourPhrases",
      "foxEndWarningPhrases",
      "foxEndPhrases",
      "foxOvertimePhrases",
      "foxBedtimePhrases",
      "foxPronunciations",
    ]);
    expect(FOX_GROUPS.find(({ title }) => title === "Remerciements")?.lists?.map(({ key }) => key)).toEqual([
      "foxThanksFollow",
      "foxThanksFollowGeneric",
      "foxThanksSub",
      "foxThanksGiftOne",
      "foxThanksGiftMany",
      "foxThanksCheer",
      "foxThanksLurk",
      "foxThanksLurkGeneric",
      "foxThanksTalkative",
    ]);
    expect(
      FOX_GROUPS.find(({ title }) => title === "Réaction et coucou")?.lists?.map(({ key }) => key),
    ).toEqual(["foxEmoteReactions"]);
    expect(FOX_GROUPS.find(({ title }) => title === "Habitués")?.lists?.map(({ key }) => key)).toEqual([
      "foxWelcomeLiveCounts",
      "foxWelcomeMilestone",
      "foxWelcomeReturn",
      "foxWelcomeYesterday",
      "foxWelcomeFirst",
    ]);
    expect(FOX_GROUPS.find(({ title }) => title === "Humeur du tchat")?.lists?.map(({ key }) => key)).toEqual(
      ["foxResumePhrases"],
    );
    expect(FOX_GROUPS.find(({ title }) => title === "Relance")?.lists?.map(({ key }) => key)).toEqual([
      "foxJabs",
      "foxReminders",
    ]);
    expect(FOX_GROUPS.find(({ title }) => title === "Quand tu cries")?.lists?.map(({ key }) => key)).toEqual([
      "foxShouts",
    ]);
    expect(
      FOX_GROUPS.find(({ title }) => title === "Quand tu parles longtemps")?.lists?.map(({ key }) => key),
    ).toEqual(["foxTunnelToFenysk", "foxTunnelToChat"]);
    expect(FOX_GROUPS.find(({ title }) => title === "Balance du son")?.lists?.map(({ key }) => key)).toEqual([
      "foxBalanceAlerts",
    ]);
    expect(FOX_GROUPS.find(({ title }) => title === "Heure du live")?.lists?.map(({ key }) => key)).toEqual([
      "foxHourPhrases",
      "foxEndWarningPhrases",
      "foxEndPhrases",
      "foxOvertimePhrases",
      "foxBedtimePhrases",
    ]);
    expect(FOX_GROUPS.find(({ title }) => title === "Prononciation")?.lists?.map(({ key }) => key)).toEqual([
      "foxPronunciations",
    ]);
  });

  it("lisent le refus d'une ligne sous la liste, avec son numéro, et le refus de la liste entière sous elle", () => {
    const errors = toFieldErrors([
      { path: "foxJabs.3", message: "ne peut pas être vide" },
      { path: "foxJabs", message: "doit être une liste de phrases" },
    ]);
    expect(errors.byKey).toEqual({ foxJabs: "ligne 4 : ne peut pas être vide" });
    expect(errors.general).toEqual([]);
    expect(toFieldErrors([{ path: "foxJabs", message: "doit être une liste de phrases" }]).byKey).toEqual({
      foxJabs: "doit être une liste de phrases",
    });
  });
});

describe("les clés de chaque onglet", () => {
  it("sont quatre-vingt-quatorze pour le renard : ses cinquante-huit curseurs, ses vingt-huit listes, ses deux heures, les cases de l'accueil, des remerciements et du bilan, la voix et les deux cases de la lecture du tchat", () => {
    expect(FOX_KEYS).toHaveLength(94);
    expect(FOX_KEYS).toContain("foxResumePhrases");
    expect(FOX_KEYS).toContain("foxSulkAfter");
    expect(FOX_KEYS).toContain("foxEmoteReactions");
    expect(FOX_KEYS).toContain("foxTalkativeMessages");
    expect(FOX_KEYS).toContain("foxThanksTalkative");
    expect(FOX_KEYS).toContain("foxWelcomeLiveCounts");
    expect(FOX_KEYS).toContain("foxWelcomeFirst");
    expect(FOX_KEYS).toContain("foxThanksLurk");
    expect(FOX_KEYS).toContain("foxThanksLurkGeneric");
    expect(FOX_KEYS).toContain("foxReminders");
    expect(FOX_TIMES.map(({ key }) => key)).toEqual(["foxEndTime", "foxLateAfter"]);
    expect(FOX_KEYS).toContain("foxEndTime");
    expect(FOX_KEYS).toContain("foxLateAfter");
    expect(FOX_TOGGLES.map(({ key }) => key)).toEqual([
      "foxShouldWelcome",
      "foxShouldThank",
      "foxShouldReviewAtEnd",
    ]);
    expect(FOX_KEYS).toContain("foxShouldReviewAtEnd");
    expect(FOX_KEYS).toContain("foxShouldWelcome");
    expect(FOX_KEYS).toContain("foxShouldThank");
    expect(FOX_KEYS).toContain("foxThanksCheer");
    expect(FOX_KEYS).toContain("foxJabs");
    expect(FOX_KEYS).toContain("foxShouts");
    expect(FOX_KEYS).toContain("foxTunnelToFenysk");
    expect(FOX_KEYS).toContain("foxTunnelToChat");
    expect(FOX_KEYS).toContain("foxBalanceAlerts");
    expect(FOX_KEYS).toContain("foxVoice");
    expect(FOX_KEYS).toContain("foxShouldReadChat");
    expect(FOX_KEYS).toContain("foxShouldReadOwn");
    expect(HEAD_KEYS).toContain("expression");
    expect(CHAT_KEYS).toHaveLength(7);
  });

  it("n'ont rien en commun d'un onglet à l'autre : un onglet ne remet à zéro que ses réglages", () => {
    expect(FOX_KEYS.filter((key) => HEAD_KEYS.includes(key))).toEqual([]);
    expect(FOX_KEYS.filter((key) => CHAT_KEYS.includes(key))).toEqual([]);
    expect(HEAD_KEYS.filter((key) => CHAT_KEYS.includes(key))).toEqual([]);
  });

  it("disent qu'un onglet est aux valeurs par défaut quand seuls les autres ont des valeurs locales", () => {
    const effective = { threshold: -40, foxVoice: "Microsoft Hortense", chatOpacity: 70 };
    const local = { foxVoice: "Microsoft Hortense", chatOpacity: 70 };
    expect(isDefaultTab(HEAD_KEYS, {}, local, effective)).toBe(true);
    expect(isDefaultTab(FOX_KEYS, {}, local, effective)).toBe(false);
    expect(isDefaultTab(HEAD_KEYS, {}, { threshold: -35 }, effective)).toBe(false);
    expect(isDefaultTab(FOX_KEYS, {}, { threshold: -35, chatOpacity: 70 }, effective)).toBe(true);
  });

  it("disent qu'un onglet n'est plus aux valeurs par défaut dès qu'un brouillon est à envoyer", () => {
    const effective = { threshold: -40, foxBounce: 0.03, foxVoice: "Microsoft Claude" };
    expect(isDefaultTab(FOX_KEYS, {}, {}, effective)).toBe(true);
    expect(isDefaultTab(FOX_KEYS, { foxBounce: 0.05 }, {}, effective)).toBe(false);
  });
});

describe("les heures de l'onglet Renard", () => {
  it("sont la fin prévue et l'heure des bâillements tardifs, chacune avec un libellé et une aide", () => {
    for (const { label, help } of FOX_TIMES) {
      expect(label.length).toBeGreaterThan(0);
      expect(help.length).toBeGreaterThan(0);
    }
  });

  it("ont pour défaut la valeur de settings.json : pas de fin prévue, 23:30", () => {
    expect(defaults.foxEndTime).toBe("");
    expect(defaults.foxLateAfter).toBe("23:30");
  });

  it("lisent le refus d'une heure sous son champ, avec son libellé", () => {
    const errors = toFieldErrors([
      { path: "foxEndTime", message: "doit s'écrire HH:MM (de 00:00 à 23:59), ou rester vide" },
    ]);
    expect(errors.byKey).toEqual({ foxEndTime: "doit s'écrire HH:MM (de 00:00 à 23:59), ou rester vide" });
    expect(errors.general).toEqual([]);
  });
});

describe("les curseurs du renard dans les échanges avec le serveur", () => {
  it("envoient un brouillon du renard comme ceux de la tête", () => {
    expect(toChanges({ foxBounce: 0.05, threshold: -35 }, {}, { threshold: -40, foxBounce: 0.03 })).toEqual({
      foxBounce: 0.05,
      threshold: -35,
    });
  });

  it("lisent un refus du renard sous son curseur, avec son libellé", () => {
    const errors = toFieldErrors([
      { path: "foxMediumThreshold", message: "foxMediumThreshold doit dépasser foxSmallThreshold" },
    ]);
    expect(errors.byKey).toEqual({
      foxMediumThreshold: "« Seuil de la bouche moyenne » doit dépasser « Seuil de la petite bouche »",
    });
    expect(errors.general).toEqual([]);
  });

  it("met en haut le refus d'une règle entre plusieurs réglages du renard", () => {
    const errors = toFieldErrors([
      { path: "", message: "les douze réglages fox* vont ensemble : tous ou aucun" },
    ]);
    expect(errors.general).toEqual(["les douze réglages fox* vont ensemble : tous ou aucun"]);
  });
});
