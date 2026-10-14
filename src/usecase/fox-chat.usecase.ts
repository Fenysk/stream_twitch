import type { RawMessage } from "../domain/chat.types";
import {
  type ChatReadRules,
  type ChatSpeech,
  type FilterReason,
  isOwnMessage,
  isTooSoon,
  toChatSpeech,
  toReadRules,
  toReasonText,
} from "../domain/chat-filter.rules";
import type { InsultList } from "../domain/chat-insults.rules";
import { isBotMessage } from "../domain/chat-message.rules";
import { toChatBots, toChatChannel } from "../domain/chat-settings.rules";
import { type Show, WAVE_MODE } from "../domain/fox-mode.rules";
import {
  EMOTE_REACTION_GAP_MS,
  type EmoteReaction,
  toEmoteReactions,
  toReaction,
} from "../domain/reaction.rules";
import type { Settings } from "../domain/settings.schema";
import type { Chat, ChatSourceEvent } from "./chat.usecase";
import type { EmoteSync } from "./emote-sync.usecase";
import type { FoxAttitude } from "./fox-attitude.usecase";
import type { FoxModeController } from "./fox-mode.usecase";
import type { FoxQueue, QueueItem } from "./fox-queue.usecase";
import type { FoxRegulars } from "./fox-regulars.usecase";
import type { FoxTally } from "./fox-tally.usecase";

export type FoxChatDeps = {
  chat: Pick<Chat, "subscribeSource">;
  queue: Pick<FoxQueue, "push" | "count" | "removeWhere">;
  // Q : la réaction d'un message d'emotes seules, montrée de lui-même (visible, rien d'autre montré).
  mode: Pick<FoxModeController, "flash">;
  // Les emotes de 7TV, BTTV et FFZ synchronisées ; `foxEmoteNames` s'y ajoute (les ajouts à la main).
  emotes: Pick<EmoteSync, "getNames">;
  // T : data/viewers.json, et la phrase d'accueil dite avant le premier message d'un viewer dans un live.
  regulars: Pick<FoxRegulars, "noteMessage">;
  // U : le compte des messages acceptés de chaque viewer.
  tally: Pick<FoxTally, "noteMessage">;
  // R : l'humeur du renard suit le tchat, et la phrase de la reprise après un long silence.
  attitude: Pick<FoxAttitude, "noteMessage">;
  settings: Settings;
  insults: InsultList;
  clock: () => number;
  log: (message: string) => void;
};

export type FoxChat = {
  // Le renard écoute le tchat : il lit les messages que le filtre laisse passer, un à la fois.
  start(): void;
  stop(): void;
  update(settings: Settings): void;
  // Le message qui accompagne un sub, un resub ou des bits : lu juste après son remerciement s'il passe le filtre (sans le
  // délai par viewer ni la taille de la file : il fait partie de l'évènement), jamais sans « Lire le tchat ».
  speakAttached(raw: RawMessage): void;
};

const LOG_TEXT_LENGTH = 100;

const isMessage = ({ kind }: QueueItem): boolean => kind === "message";

// Le texte d'un message dans le journal : sur une ligne, sans caractère de contrôle, coupé.
const toLogText = (text: string): string => {
  const line = text.replace(/\p{Cc}/gu, " ");
  const points = Array.from(line);
  return points.length > LOG_TEXT_LENGTH ? `${points.slice(0, LOG_TEXT_LENGTH).join("")}…` : line;
};

export function createFoxChat({
  chat,
  queue,
  mode,
  emotes,
  regulars,
  tally,
  attitude,
  settings: initial,
  insults,
  clock,
  log,
}: FoxChatDeps): FoxChat {
  let settings = initial;
  let rules = toReadRules(initial);
  // Q : les emotes qui changent sa tête, et quand la dernière a changé celle d'un message d'emotes seules.
  let emoteReactions: readonly EmoteReaction[] = toEmoteReactions(initial.foxEmoteReactions);
  let lastEmoteReactionAt: number | null = null;
  const lastReadAt = new Map<string, number>();
  // G : les viewers déjà lus depuis le démarrage du serveur, le coucou est pour les autres.
  const greeted = new Set<string>();
  let unsubscribe: (() => void) | undefined;

  const skip = (raw: RawMessage, reason: FilterReason) =>
    log(`Renard : message de ${raw.nickname} ignoré (${toReasonText(reason)}) : « ${toLogText(raw.text)} »`);

  // G à la place de E : le coucou au premier message lu d'un viewer (pas au compte de la chaîne), sinon la réaction du mot-clé.
  const toShow = (raw: RawMessage, isOwn: boolean): Show | null => {
    if (!isOwn && !greeted.has(raw.viewerId)) {
      greeted.add(raw.viewerId);
      return WAVE_MODE;
    }
    const image = toReaction(raw.text, emoteReactions);
    return image ? { kind: "reaction", image } : null;
  };

  // Q : un message d'emotes seules (rien à lire) montre quand même sa réaction, sans lecture : seulement visible et muet, au plus
  // une toutes les 5 s. Caché, il ne revient pas.
  const reactToEmotes = (raw: RawMessage) => {
    const image = toReaction(raw.text, emoteReactions);
    if (image === null) return;
    const now = clock();
    if (lastEmoteReactionAt !== null && now - lastEmoteReactionAt < EMOTE_REACTION_GAP_MS) return;
    if (queue.count(() => true) > 0) return;
    if (mode.flash({ kind: "reaction", image }) === 0) return;
    lastEmoteReactionAt = now;
  };

  // Ce qui retient un message que le filtre laisse passer : le pace de son viewer, ou une file pleine. Un message ignoré par
  // le filtre ne compte donc pas pour le pace.
  const toHold = (raw: RawMessage, read: ChatReadRules): FilterReason | undefined => {
    const now = clock();
    for (const [viewerId, at] of lastReadAt) if (!isTooSoon(at, now, read.gap)) lastReadAt.delete(viewerId);
    if (isTooSoon(lastReadAt.get(raw.viewerId), now, read.gap)) return { family: "pace", gap: read.gap };
    const size = queue.count(isMessage);
    return size >= read.queueSize ? { family: "queue", size } : undefined;
  };

  // Ce que le renard fait d'un message : le lire (son texte), ou l'ignorer (sa raison).
  const decide = (raw: RawMessage, read: ChatReadRules, isOwn: boolean): ChatSpeech => {
    if (isOwn && !read.shouldReadOwn) return { ok: false, reason: { family: "own" } };
    const speech = toChatSpeech(raw, {
      maxLength: read.maxLength,
      capitalsMaxLength: read.capitalsMaxLength,
      emoteNames: [...emotes.getNames(), ...read.emoteNames],
      bots: toChatBots(settings),
      insults,
    });
    if (!speech.ok) return speech;
    const hold = toHold(raw, read);
    return hold ? { ok: false, reason: hold } : speech;
  };

  // Un message que le filtre ignore : le journal le dit. D'emotes seules (Q), il montre quand même sa réaction.
  const ignore = (raw: RawMessage, reason: FilterReason) => {
    skip(raw, reason);
    if (reason.family === "emotes") reactToEmotes(raw);
  };

  // H : un message accepté (après le filtre) réveille le renard, qui revient s'il était parti. Le compte (U), le fichier des
  // habitués (T) et l'humeur (R) le voient. Une seule phrase est dite avant lui, d'une seule traite : la reprise après un long
  // silence du tchat, sinon l'accueil d'un habitué.
  const accept = (raw: RawMessage, text: string, isOwn: boolean) => {
    lastReadAt.set(raw.viewerId, clock());
    if (!isOwn) tally.noteMessage(raw);
    const resume = isOwn ? null : attitude.noteMessage({ isAccepted: true });
    const welcome = isOwn ? null : regulars.noteMessage(raw, { canWelcome: resume === null });
    const before = resume ?? welcome;
    queue.push({
      kind: "message",
      label: `message de ${raw.nickname}`,
      text: before === null ? text : `${before} ${text}`,
      messageId: raw.id,
      viewerId: raw.viewerId,
      isCuttable: true,
      isUrgent: false,
      toShow: () => toShow(raw, isOwn),
    });
  };

  const receiveMessage = (raw: RawMessage) => {
    const isOwn = isOwnMessage(raw, toChatChannel(settings));
    const decision = rules?.shouldReadChat ? decide(raw, rules, isOwn) : undefined;
    if (decision?.ok) {
      accept(raw, decision.text, isOwn);
      return;
    }
    // Ni lu ni accepté, le tchat a quand même parlé (R) ; seuls le compte de la chaîne et les bots ne comptent pas.
    if (!isOwn && !isBotMessage(raw, toChatBots(settings))) attitude.noteMessage({ isAccepted: false });
    if (decision) ignore(raw, decision.reason);
  };

  // Le filtre, puis la file devant les messages, sans coucou ni réaction : le remerciement a déjà eu la sienne.
  const speakAttached = (raw: RawMessage) => {
    if (!rules?.shouldReadChat) return;
    const speech = toChatSpeech(raw, {
      maxLength: rules.maxLength,
      capitalsMaxLength: rules.capitalsMaxLength,
      emoteNames: [...emotes.getNames(), ...rules.emoteNames],
      bots: toChatBots(settings),
      insults,
    });
    if (!speech.ok) {
      skip(raw, speech.reason);
      return;
    }
    queue.push({
      kind: "message",
      label: `message de ${raw.nickname}`,
      text: speech.text,
      messageId: raw.id,
      viewerId: raw.viewerId,
      isCuttable: true,
      isUrgent: true,
      toShow: () => null,
    });
  };

  // Un message supprimé (ou tous ceux d'un viewer banni) sort de la file ; s'il est en train d'être lu, la lecture s'arrête.
  const receive = (event: ChatSourceEvent) => {
    switch (event.kind) {
      case "message":
        receiveMessage(event.message);
        break;
      case "message-deleted":
        queue.removeWhere((item) => item.messageId === event.messageId, "supprimé par la modération");
        break;
      case "viewer-messages-deleted":
        queue.removeWhere((item) => item.viewerId === event.viewerId, "viewer banni ou en timeout");
        break;
    }
  };

  return {
    start() {
      unsubscribe ??= chat.subscribeSource(receive);
    },
    stop() {
      unsubscribe?.();
      unsubscribe = undefined;
      queue.removeWhere(isMessage);
    },
    update(next) {
      const wasReading = rules?.shouldReadChat;
      settings = next;
      rules = toReadRules(next);
      emoteReactions = toEmoteReactions(next.foxEmoteReactions);
      const isReading = rules?.shouldReadChat;
      if (wasReading !== isReading) log(`Renard : lecture du tchat ${isReading ? "activée" : "désactivée"}.`);
      if (!isReading) queue.removeWhere(isMessage);
    },
    speakAttached,
  };
}
