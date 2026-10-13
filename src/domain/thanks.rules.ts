import type { LiveEvent } from "./live.types";
import type { Settings } from "./settings.schema";

// Les listes de phrases de remerciement (réglages `fox*`), une par sorte d'évènement.
export type ThanksKey =
  | "foxThanksFollow"
  | "foxThanksFollowGeneric"
  | "foxThanksSub"
  | "foxThanksGiftOne"
  | "foxThanksGiftMany"
  | "foxThanksCheer";

// Ce qu'il montre avant la phrase : un sourire (1 s) pour un follow ou un cheer, un saut de joie pour un sub.
export type ThanksShow = "smile" | "joy";

export type ThanksPlan = {
  list: ThanksKey;
  // Les valeurs des variables de la phrase. Une variable absente (`viewers` quand on ne sait pas combien ils sont)
  // écarte les phrases qui l'écrivent.
  values: Readonly<Record<string, string | number>>;
  show: ThanksShow;
};

// Plusieurs follows regroupés (une rafale) : une seule phrase, sans pseudo.
export type ThanksSubject = LiveEvent | { kind: "follow-group" };

// Un pseudo refusé par le filtre d'insultes n'est pas dit : il devient « quelqu'un ».
export const SOMEONE = "quelqu'un";

export type ThanksContext = {
  isRefused: (name: string) => boolean;
  // Le nombre de viewers du live ; `null` quand on ne le sait pas (hors ligne, pas de réponse).
  viewers: number | null;
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
  }
}

// Les réglages des remerciements : la case, le délai entre deux remerciements nominatifs de follow (ms), et les phrases de
// chaque sorte d'évènement.
export type ThanksRules = {
  shouldThank: boolean;
  gap: number;
  phrases: Readonly<Record<ThanksKey, readonly string[]>>;
};

// Sans les réglages du renard (tous ou aucun), il ne remercie pas.
export function toThanksRules(settings: Settings): ThanksRules | undefined {
  const {
    foxShouldThank,
    foxThankGap,
    foxThanksFollow,
    foxThanksFollowGeneric,
    foxThanksSub,
    foxThanksGiftOne,
    foxThanksGiftMany,
    foxThanksCheer,
  } = settings;
  if (
    foxShouldThank === undefined ||
    foxThankGap === undefined ||
    foxThanksFollow === undefined ||
    foxThanksFollowGeneric === undefined ||
    foxThanksSub === undefined ||
    foxThanksGiftOne === undefined ||
    foxThanksGiftMany === undefined ||
    foxThanksCheer === undefined
  )
    return undefined;
  return {
    shouldThank: foxShouldThank,
    gap: foxThankGap,
    phrases: {
      foxThanksFollow,
      foxThanksFollowGeneric,
      foxThanksSub,
      foxThanksGiftOne,
      foxThanksGiftMany,
      foxThanksCheer,
    },
  };
}
