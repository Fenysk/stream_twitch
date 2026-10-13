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
import { toChatBots, toChatChannel } from "../domain/chat-settings.rules";
import { type Show, WAVE_MODE } from "../domain/fox-mode.rules";
import { toReaction } from "../domain/reaction.rules";
import type { Settings } from "../domain/settings.schema";
import type { Chat, ChatSourceEvent } from "./chat.usecase";
import type { EmoteSync } from "./emote-sync.usecase";
import type { FoxQueue, QueueItem } from "./fox-queue.usecase";

export type FoxChatDeps = {
  chat: Pick<Chat, "subscribeSource">;
  queue: Pick<FoxQueue, "push" | "count" | "removeWhere">;
  // Les emotes de 7TV, BTTV et FFZ synchronisées ; `foxEmoteNames` s'y ajoute (les ajouts à la main).
  emotes: Pick<EmoteSync, "getNames">;
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
  emotes,
  settings: initial,
  insults,
  clock,
  log,
}: FoxChatDeps): FoxChat {
  let settings = initial;
  let rules = toReadRules(initial);
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
    const image = toReaction(raw.text);
    return image ? { kind: "reaction", image } : null;
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

  // H : un message accepté (après le filtre) réveille le renard, qui revient s'il était parti ; un message ignoré, non.
  const receiveMessage = (raw: RawMessage) => {
    if (!rules?.shouldReadChat) return;
    const isOwn = isOwnMessage(raw, toChatChannel(settings));
    const decision = decide(raw, rules, isOwn);
    if (!decision.ok) {
      skip(raw, decision.reason);
      return;
    }
    lastReadAt.set(raw.viewerId, clock());
    queue.push({
      kind: "message",
      label: `message de ${raw.nickname}`,
      text: decision.text,
      messageId: raw.id,
      viewerId: raw.viewerId,
      isCuttable: true,
      isUrgent: false,
      toShow: () => toShow(raw, isOwn),
    });
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
      const isReading = rules?.shouldReadChat;
      if (wasReading !== isReading) log(`Renard : lecture du tchat ${isReading ? "activée" : "désactivée"}.`);
      if (!isReading) queue.removeWhere(isMessage);
    },
    speakAttached,
  };
}
