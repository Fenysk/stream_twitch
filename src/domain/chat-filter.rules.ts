import type { RawMessage } from "./chat.types";
import { type ContactKind, toContactKind } from "./chat-contact.rules";
import { toTextWithoutEmotes } from "./chat-emotes.rules";
import { type InsultList, toInsultMatch } from "./chat-insults.rules";
import { toSpokenMentions } from "./chat-mentions.rules";
import { toHiddenKind } from "./chat-message.rules";
import { type SpamKind, toSpamKind } from "./chat-spam.rules";
import type { Settings } from "./settings.schema";

// Pourquoi le renard ne lit pas un message : la famille du filtre, avec ce qui aide à la régler.
export type FilterReason =
  | { family: "command" }
  | { family: "bot" }
  | { family: "contact"; kind: ContactKind }
  | { family: "length"; length: number; max: number }
  | { family: "spam"; kind: SpamKind }
  | { family: "emotes" }
  | { family: "insult"; entry: string }
  | { family: "own" }
  | { family: "pace"; gap: number }
  | { family: "queue"; size: number };

export type ChatFilterRules = {
  maxLength: number;
  // Au plus de caractères, un message en majuscules n'est pas du spam.
  capitalsMaxLength: number;
  emoteNames: readonly string[];
  // Les noms de compte des bots, en minuscules (toChatBots).
  bots: readonly string[];
  insults: InsultList;
};

// Ce que le renard dit d'un message, ou pourquoi il n'en dit rien.
export type ChatSpeech = { ok: true; text: string } | { ok: false; reason: FilterReason };

const ignored = (reason: FilterReason): ChatSpeech => ({ ok: false, reason });

// Le filtre, une famille après l'autre, dans l'ordre du brainstorm du 06/10 ; la première qui joue donne la raison. Les
// liens et la longueur se jugent sur le message tel que le viewer l'a écrit ; le spam et les insultes sur ce qui sera dit,
// emotes retirées (OMEGALUL n'est pas un cri) et mentions lues sans arobase. Le nickname de l'auteur n'est jamais dit : seul
// le texte entre ici.
export function toChatSpeech(raw: RawMessage, rules: ChatFilterRules): ChatSpeech {
  const hidden = toHiddenKind(raw, rules.bots);
  if (hidden) return ignored({ family: hidden });
  const contact = toContactKind(raw.text);
  if (contact) return ignored({ family: "contact", kind: contact });
  const length = Array.from(raw.text).length;
  if (length > rules.maxLength) return ignored({ family: "length", length, max: rules.maxLength });
  const { text, insult: mentioned } = toSpokenMentions(
    toTextWithoutEmotes(raw.text, raw.emotes, rules.emoteNames),
    rules.insults,
  );
  const spam = toSpamKind(text, rules.capitalsMaxLength);
  if (spam) return ignored({ family: "spam", kind: spam });
  if (text === "")
    return ignored(mentioned === null ? { family: "emotes" } : { family: "insult", entry: mentioned });
  const insult = toInsultMatch(text, rules.insults);
  if (insult !== null) return ignored({ family: "insult", entry: insult });
  return { ok: true, text };
}

const CONTACT_TEXTS: Record<ContactKind, string> = {
  link: "lien",
  email: "adresse mail",
  phone: "numéro de téléphone",
};

const SPAM_TEXTS: Record<SpamKind, string> = {
  repetition: "mot répété",
  letters: "lettres répétées",
  capitals: "majuscules",
  drawing: "dessin en caractères",
};

// La raison dans le journal du serveur, en français : de quoi régler le filtre.
export function toReasonText(reason: FilterReason): string {
  switch (reason.family) {
    case "command":
      return "commande";
    case "bot":
      return "bot connu";
    case "contact":
      return CONTACT_TEXTS[reason.kind];
    case "length":
      return `trop long : ${reason.length} caractères, ${reason.max} au plus`;
    case "spam":
      return `spam : ${SPAM_TEXTS[reason.kind]}`;
    case "emotes":
      return "il ne reste que des emotes";
    case "insult":
      return `insulte : « ${reason.entry} »`;
    case "own":
      return "message du compte de la chaîne";
    case "pace":
      return `même viewer lu il y a moins de ${reason.gap / 1000} s`;
    case "queue":
      return `file pleine : ${reason.size} messages`;
  }
}

// Les messages du compte de la chaîne (le sien) : « Lire mes messages » les laisse ou non.
export const isOwnMessage = (raw: RawMessage, channel: string): boolean =>
  raw.viewerLogin.toLowerCase() === channel.toLowerCase();

// Un viewer relu avant la fin du pace : son message n'est pas lu.
export const isTooSoon = (lastAt: number | undefined, now: number, gap: number): boolean =>
  lastAt !== undefined && now - lastAt < gap;

// Un message accepté qui attend dans la queue depuis plus de `maxWait` (ms) n'est plus lu.
export const hasWaitedTooLong = (queuedAt: number, now: number, maxWait: number): boolean =>
  now - queuedAt > maxWait;

// Une durée pour le journal du serveur : des minutes pleines (« 2 min »), sinon des secondes (« 90 s », « 1,5 s »).
export const toWaitText = (ms: number): string =>
  ms >= 60_000 && ms % 60_000 === 0 ? `${ms / 60_000} min` : `${String(ms / 1000).replace(".", ",")} s`;

// Les réglages de la lecture du tchat (settings.json, `foxShouldRead*` et `foxRead*`).
export type ChatReadRules = {
  shouldReadChat: boolean;
  shouldReadOwn: boolean;
  maxLength: number;
  capitalsMaxLength: number;
  gap: number;
  queueSize: number;
  emoteNames: readonly string[];
};

// Sans les réglages du renard (tous ou aucun), pas de lecture.
export function toReadRules(settings: Settings): ChatReadRules | undefined {
  const {
    foxShouldReadChat,
    foxShouldReadOwn,
    foxReadMaxLength,
    foxCapitalsMaxLength,
    foxReadGap,
    foxReadQueueSize,
    foxEmoteNames,
  } = settings;
  if (
    foxShouldReadChat === undefined ||
    foxShouldReadOwn === undefined ||
    foxReadMaxLength === undefined ||
    foxCapitalsMaxLength === undefined ||
    foxReadGap === undefined ||
    foxReadQueueSize === undefined ||
    foxEmoteNames === undefined
  )
    return undefined;
  return {
    shouldReadChat: foxShouldReadChat,
    shouldReadOwn: foxShouldReadOwn,
    maxLength: foxReadMaxLength,
    capitalsMaxLength: foxCapitalsMaxLength,
    gap: foxReadGap,
    queueSize: foxReadQueueSize,
    emoteNames: foxEmoteNames,
  };
}
