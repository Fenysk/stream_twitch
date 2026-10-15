// Les phrases du renard sont des listes de réglages `fox*`, une phrase par entrée ; une phrase écrit des variables entre
// accolades (« Merci {user} ! »). Ces variables sont celles de sa liste, et seulement elles.
export const PHRASE_VARIABLES: Readonly<Record<string, readonly string[]>> = {
  foxJabs: [],
  foxReminders: [],
  foxShouts: [],
  foxTunnelToFenysk: [],
  foxTunnelToChat: [],
  foxComebackToFenysk: ["absence"],
  foxComebackToChat: ["absence"],
  foxBalanceAlerts: [],
  foxHourPhrases: ["heures"],
  foxEndWarningPhrases: ["minutes", "fin"],
  foxEndPhrases: ["fin", "maintenant"],
  foxOvertimePhrases: ["fin", "maintenant", "retard"],
  foxBedtimePhrases: ["fin", "maintenant", "retard"],
  foxThanksFollow: ["user", "viewers"],
  foxThanksFollowGeneric: [],
  foxThanksSub: ["user"],
  foxThanksGiftOne: ["user", "recipient"],
  foxThanksGiftMany: ["user", "count"],
  foxThanksCheer: ["user", "bits"],
  foxThanksLurk: ["user"],
  foxThanksLurkGeneric: [],
  foxThanksTalkative: ["user", "messages"],
  foxWelcomeMilestone: ["user", "lives"],
  foxWelcomeReturn: ["user", "absence"],
  foxWelcomeYesterday: ["user"],
  foxWelcomeFirst: ["user"],
  foxResumePhrases: [],
  foxThanksRaid: ["user", "viewers"],
  foxThanksRaidGeneric: ["viewers"],
  foxClashIntros: ["user"],
  foxThanksWakeAsleep: ["user"],
  foxThanksWakeAwake: ["user"],
  foxThanksPrediction: ["perdants", "issue"],
  foxThanksPredictionNoLoser: [],
};

const VARIABLE = /\{(\w+)\}/g;

// Ce qu'on écrit dans le champ d'une liste : une phrase par ligne, sans espace aux bords, sans ligne vide.
export const toPhraseLines = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");

export const toPhraseText = (phrases: readonly string[]): string => phrases.join("\n");

// Les noms des variables qu'une phrase écrit, dans l'ordre (un nom écrit deux fois sort deux fois).
export const toVariablesIn = (phrase: string): string[] =>
  [...phrase.matchAll(VARIABLE)].map(([, name]) => name ?? "");

// La phrase une fois les variables remplacées. Une variable qu'on ne connaît pas reste écrite telle quelle.
export const toFilledPhrase = (phrase: string, values: Readonly<Record<string, string | number>>): string =>
  phrase.replace(VARIABLE, (whole, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : whole,
  );

// Toutes les variables de la phrase ont une valeur : sans, on ne la dit pas (« On est . » n'a pas de sens).
export const isFillable = (phrase: string, values: Readonly<Record<string, string | number>>): boolean =>
  toVariablesIn(phrase).every((name) => Object.hasOwn(values, name));

// Un compte et son unité au pluriel quand il dépasse 1 : « 1 personne », « 12 personnes », « 0 personne ».
export const toCount = (count: number, unit: string): string => `${count} ${unit}${count > 1 ? "s" : ""}`;
