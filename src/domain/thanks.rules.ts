import type { LiveEvent } from "./live.types";
import { toCount } from "./phrase.rules";
import type { Settings } from "./settings.schema";

// Les listes de phrases de remerciement (réglages `fox*`), une par sorte d'évènement.
export type ThanksKey =
  | "foxThanksFollow"
  | "foxThanksFollowGeneric"
  | "foxThanksSub"
  | "foxThanksGiftOne"
  | "foxThanksGiftMany"
  | "foxThanksCheer"
  | "foxThanksLurk"
  | "foxThanksLurkGeneric"
  | "foxThanksTalkative"
  | "foxThanksRaid"
  | "foxThanksRaidGeneric"
  | "foxThanksWakeAsleep"
  | "foxThanksWakeAwake"
  | "foxThanksPrediction"
  | "foxThanksPredictionNoLoser";

// Ce qu'il montre avant la phrase : un sourire (1 s) pour un follow ou un cheer, un saut de joie pour un sub, un long coucou
// pour un raid, rien pour une récompense qui le réveille ni pour une prédiction.
export type ThanksShow = "smile" | "joy" | "raid" | "none";

export type ThanksPlan = {
  list: ThanksKey;
  // Les valeurs des variables de la phrase. Une variable absente (`viewers` quand on ne sait pas combien ils sont)
  // écarte les phrases qui l'écrivent.
  values: Readonly<Record<string, string | number>>;
  show: ThanksShow;
};

// Plusieurs follows regroupés (une rafale) : une seule phrase, sans pseudo. Un lurk : un viewer a écrit « !lurk » dans le tchat.
// Un viewer très impliqué : il vient d'atteindre `foxTalkativeMessages` messages acceptés depuis le démarrage du serveur.
// Un réveil : la récompense « Réveiller Jean-Renard » (`isAsleep` : il n'était pas visible). Les autres récompenses ne sont pas
// des remerciements : le clash est une pique, le reste est ignoré.
export type ThanksSubject =
  | Exclude<LiveEvent, { kind: "reward" }>
  | { kind: "follow-group" }
  | { kind: "lurk"; user: string }
  | { kind: "talkative"; user: string; messages: number }
  | { kind: "wake"; user: string; isAsleep: boolean };

// Le premier mot du message est « !lurk », majuscules ignorées : le viewer regarde sans parler.
export const isLurk = (text: string): boolean => text.trim().split(/\s+/, 1)[0]?.toLowerCase() === "!lurk";

// Un pseudo refusé par le filtre d'insultes n'est pas dit : il devient « quelqu'un ».
export const SOMEONE = "quelqu'un";

export type ThanksContext = {
  isRefused: (name: string) => boolean;
  // Le nombre de viewers du live ; `null` quand on ne le sait pas (hors ligne, pas de réponse).
  viewers: number | null;
};

// Un raid : le pseudo, et le nombre de viewers du raid (pas ceux du live) ; un pseudo refusé donne la phrase sans pseudo.
const toRaidPlan = (user: string, viewers: number, isRefused: boolean): ThanksPlan => {
  const crowd = toCount(viewers, "personne");
  if (isRefused) return { list: "foxThanksRaidGeneric", values: { viewers: crowd }, show: "raid" };
  return { list: "foxThanksRaid", values: { user, viewers: crowd }, show: "raid" };
};

// Une prédiction : des perdants sans issue à citer ne se disent pas, « Perdants sur  : » n'a pas de sens.
const toPredictionPlan = (losers: number, outcome: string | null): ThanksPlan => {
  if (losers === 0 || outcome === null) {
    return { list: "foxThanksPredictionNoLoser", values: {}, show: "none" };
  }
  return {
    list: "foxThanksPrediction",
    values: { perdants: toCount(losers, "personne"), issue: outcome },
    show: "none",
  };
};

// Quelle liste de phrases, avec quelles valeurs, et quelle animation, pour cet évènement.
export function toThanksPlan(subject: ThanksSubject, { isRefused, viewers }: ThanksContext): ThanksPlan {
  const name = (user: string): string => (isRefused(user) ? SOMEONE : user);
  switch (subject.kind) {
    case "follow-group":
      return { list: "foxThanksFollowGeneric", values: {}, show: "smile" };
    case "follow":
      if (isRefused(subject.user)) return { list: "foxThanksFollowGeneric", values: {}, show: "smile" };
      return {
        list: "foxThanksFollow",
        values: viewers !== null && viewers > 0 ? { user: subject.user, viewers } : { user: subject.user },
        show: "smile",
      };
    case "sub":
      return { list: "foxThanksSub", values: { user: name(subject.user) }, show: "joy" };
    case "gift":
      return {
        list: "foxThanksGiftOne",
        values: { user: name(subject.user), recipient: name(subject.recipient) },
        show: "joy",
      };
    case "mystery-gift":
      return {
        list: "foxThanksGiftMany",
        values: { user: name(subject.user), count: subject.count },
        show: "joy",
      };
    case "cheer":
      return {
        list: "foxThanksCheer",
        values: { user: name(subject.user), bits: subject.bits },
        show: "smile",
      };
    case "lurk":
      if (isRefused(subject.user)) return { list: "foxThanksLurkGeneric", values: {}, show: "smile" };
      return { list: "foxThanksLurk", values: { user: subject.user }, show: "smile" };
    case "talkative":
      return {
        list: "foxThanksTalkative",
        values: { user: name(subject.user), messages: subject.messages },
        show: "smile",
      };
    case "prediction":
      return toPredictionPlan(subject.losers, subject.outcome);
    case "wake":
      return {
        list: subject.isAsleep ? "foxThanksWakeAsleep" : "foxThanksWakeAwake",
        values: { user: name(subject.user) },
        show: "none",
      };
    case "raid":
      return toRaidPlan(subject.user, subject.viewers, isRefused(subject.user));
  }
}

// Les titres des récompenses de points de chaîne que le renard reconnaît.
export type RewardTitles = { clash: readonly string[]; wake: readonly string[] };

export type RewardKind = "clash" | "wake";

const toTitle = (title: string): string => title.trim().toLowerCase();

// Le titre d'une récompense dit ce qu'elle fait, sans tenir compte des majuscules ni des espaces aux bords ; un autre titre est
// ignoré. Le même titre dans les deux listes donne le clash.
export function toRewardKind(title: string, { clash, wake }: RewardTitles): RewardKind | null {
  const wanted = toTitle(title);
  const isTitled = (titles: readonly string[]): boolean => titles.some((other) => toTitle(other) === wanted);
  if (isTitled(clash)) return "clash";
  return isTitled(wake) ? "wake" : null;
}

// Les réglages des remerciements : la case, le délai entre deux remerciements nominatifs de follow (ms), le nombre de messages
// d'un viewer très impliqué, les titres des récompenses, et les phrases de chaque sorte d'évènement.
export type ThanksRules = {
  shouldThank: boolean;
  gap: number;
  talkativeAt: number;
  rewards: RewardTitles;
  phrases: Readonly<Record<ThanksKey, readonly string[]>>;
};

// Sans les réglages du renard (tous ou aucun), il ne remercie pas.
export function toThanksRules(settings: Settings): ThanksRules | undefined {
  const {
    foxShouldThank,
    foxThankGap,
    foxTalkativeMessages,
    foxThanksFollow,
    foxThanksFollowGeneric,
    foxThanksSub,
    foxThanksGiftOne,
    foxThanksGiftMany,
    foxThanksCheer,
    foxThanksLurk,
    foxThanksLurkGeneric,
    foxThanksTalkative,
    foxThanksRaid,
    foxThanksRaidGeneric,
    foxClashRewards,
    foxWakeRewards,
    foxThanksWakeAsleep,
    foxThanksWakeAwake,
    foxThanksPrediction,
    foxThanksPredictionNoLoser,
  } = settings;
  if (
    foxShouldThank === undefined ||
    foxThankGap === undefined ||
    foxTalkativeMessages === undefined ||
    foxThanksFollow === undefined ||
    foxThanksFollowGeneric === undefined ||
    foxThanksSub === undefined ||
    foxThanksGiftOne === undefined ||
    foxThanksGiftMany === undefined ||
    foxThanksCheer === undefined ||
    foxThanksLurk === undefined ||
    foxThanksLurkGeneric === undefined ||
    foxThanksTalkative === undefined ||
    foxThanksRaid === undefined ||
    foxThanksRaidGeneric === undefined ||
    foxClashRewards === undefined ||
    foxWakeRewards === undefined ||
    foxThanksWakeAsleep === undefined ||
    foxThanksWakeAwake === undefined ||
    foxThanksPrediction === undefined ||
    foxThanksPredictionNoLoser === undefined
  )
    return undefined;
  return {
    shouldThank: foxShouldThank,
    gap: foxThankGap,
    talkativeAt: foxTalkativeMessages,
    rewards: { clash: foxClashRewards, wake: foxWakeRewards },
    phrases: {
      foxThanksFollow,
      foxThanksFollowGeneric,
      foxThanksSub,
      foxThanksGiftOne,
      foxThanksGiftMany,
      foxThanksCheer,
      foxThanksLurk,
      foxThanksLurkGeneric,
      foxThanksTalkative,
      foxThanksRaid,
      foxThanksRaidGeneric,
      foxThanksWakeAsleep,
      foxThanksWakeAwake,
      foxThanksPrediction,
      foxThanksPredictionNoLoser,
    },
  };
}
