import ComfyJS from "comfy.js";
import { z } from "zod";
import type { EmoteRange, RawMessage } from "../domain/chat.types";
import type { LiveEvent } from "../domain/live.types";
import { toIssuesMessage } from "../shared/zod-issues";
import type { ChatSource } from "../usecase/chat.usecase";

export type ChatClientDeps = { channel: string; log: (message: string) => void };

// Les évènements de ComfyJS dont le client a besoin. Des méthodes (et non des propriétés) pour que les `extra` typés de
// ComfyJS passent en `unknown` : ils sont relus plus bas, ComfyJS y met parfois `null`.
// `onBan` et `onTimeout` existent dans ComfyJS 1.1.29 mais pas dans ses types.
export type ComfyEvents = {
  onChat(user: string, message: string, flags: unknown, self: boolean, extra: unknown): void;
  onCommand(user: string, command: string, message: string, flags: unknown, extra: unknown): void;
  onMessageDeleted(id: string, extra: unknown): void;
  onSub(user: string, message: string, tier: unknown, extra: unknown): void;
  onResub(
    user: string,
    message: string,
    streakMonths: number,
    cumulativeMonths: number,
    tier: unknown,
    extra: unknown,
  ): void;
  onSubGift(
    gifter: string,
    streakMonths: number,
    recipient: string,
    senderCount: number,
    tier: unknown,
    extra: unknown,
  ): void;
  onSubMysteryGift(gifter: string, count: number, senderCount: number, tier: unknown, extra: unknown): void;
  onCheer(user: string, message: string, bits: number, flags: unknown, extra: unknown): void;
  onBan(username: string, extra: unknown): void;
  onTimeout(username: string, seconds: number, extra: unknown): void;
  onJoin(user: string, self: boolean, extra: unknown): void;
  onConnected(address: string, port: number, isFirstConnect: boolean): void;
  onReconnect(count: number): void;
  onError(error: unknown): void;
};

// ComfyJS vu du client ; les tests l'implémentent avec un faux. ComfyJS est un singleton : un seul tchat par processus.
export type ComfySocket = {
  listen(events: ComfyEvents): void;
  connect(channel: string): void;
  disconnect(): void;
};

export function createComfySocket(): ComfySocket {
  return {
    listen(events) {
      Object.assign(ComfyJS, events);
    },
    // Aucun mot de passe : ComfyJS rejoint le tchat comme un visiteur, par IRC. EventSub ne démarre qu'avec un jeton,
    // et `useEventSub` reste à sa valeur par défaut.
    connect: (channel) => ComfyJS.Init(channel, undefined, [channel], false),
    disconnect: () => ComfyJS.Disconnect(),
  };
}

// Les champs de `extra` dont le client a besoin. ComfyJS donne `null` pour une couleur ou des emotes absentes.
const MessageExtraSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  username: z.string().min(1),
  userColor: z.string().nullish(),
  messageEmotes: z.record(z.string(), z.array(z.string())).nullish(),
});
type MessageExtra = z.infer<typeof MessageExtraSchema>;

// Un sub offert qui fait partie d'une série (`msg-param-community-gift-id`) est un des destinataires d'un sub mystère : la
// série compte pour un seul évènement, ce destinataire-là est ignoré.
const GiftExtraSchema = z.object({ userState: z.record(z.string(), z.unknown()).nullish() });

// Un ban et un timeout donnent le même résultat : l'identifiant du viewer dont les messages sortent.
const BanExtraSchema = z
  .object({ bannedUserId: z.string().min(1) })
  .transform(({ bannedUserId }) => bannedUserId);
const SuspensionExtraSchema = z
  .object({ timedOutUserId: z.string().min(1) })
  .transform(({ timedOutUserId }) => timedOutUserId);

const RANGE = /^(\d+)-(\d+)$/;

// `{ "25": ["0-4", "6-10"] }` (identifiant de l'emote, positions dans le texte) vers une liste à plat.
const toEmoteRanges = (emotes: Record<string, string[]> | null | undefined): EmoteRange[] =>
  Object.entries(emotes ?? {}).flatMap(([id, ranges]) =>
    ranges.flatMap((range) => {
      const match = RANGE.exec(range);
      return match ? [{ id, start: Number(match[1]), end: Number(match[2]) }] : [];
    }),
  );

const toRawMessage = (user: string, text: string, isCommand: boolean, extra: MessageExtra): RawMessage => ({
  id: extra.id,
  viewerId: extra.userId,
  viewerLogin: extra.username,
  nickname: user || extra.username,
  color: extra.userColor || null,
  text,
  emotes: toEmoteRanges(extra.messageEmotes),
  isCommand,
});

// Le message qui accompagne un sub, un resub ou des bits : `null` quand il n'y en a pas, ou qu'on ne peut pas le lire.
const toAttachedMessage = (user: string, text: string, extra: unknown): RawMessage | null => {
  const parsed = MessageExtraSchema.safeParse(extra);
  if (!parsed.success || text.trim() === "") return null;
  return toRawMessage(user, text, text.startsWith("!"), parsed.data);
};

export function createChatClient(
  { channel, log }: ChatClientDeps,
  socket: ComfySocket = createComfySocket(),
): ChatSource {
  let isStarted = false;
  return {
    start(listener) {
      if (isStarted) return;
      isStarted = true;
      const receiveMessage = (user: string, text: string, isCommand: boolean, extra: unknown) => {
        const parsed = MessageExtraSchema.safeParse(extra);
        if (parsed.success)
          listener({ kind: "message", message: toRawMessage(user, text, isCommand, parsed.data) });
        else log(`Tchat : message illisible, ignoré (${toIssuesMessage(parsed.error)}).`);
      };
      const receiveViewerDeleted = (schema: z.ZodType<string>, extra: unknown) => {
        const parsed = schema.safeParse(extra);
        if (parsed.success) listener({ kind: "viewer-messages-deleted", viewerId: parsed.data });
        else log(`Tchat : ban ou timeout sans viewer, ignoré (${toIssuesMessage(parsed.error)}).`);
      };
      const live = (event: LiveEvent) => listener({ kind: "live", event });
      const isInSeries = (extra: unknown): boolean => {
        const parsed = GiftExtraSchema.safeParse(extra);
        return parsed.success && Boolean(parsed.data.userState?.["msg-param-community-gift-id"]);
      };
      socket.listen({
        onChat: (user, text, _flags, _self, extra) => receiveMessage(user, text, false, extra),
        // ComfyJS sépare la commande de son texte et la passe en minuscules : le message est recomposé.
        onCommand: (user, command, text, _flags, extra) =>
          receiveMessage(user, text ? `!${command} ${text}` : `!${command}`, true, extra),
        onMessageDeleted: (id) => listener({ kind: "message-deleted", messageId: id }),
        onSub: (user, text, _tier, extra) =>
          live({ kind: "sub", user, message: toAttachedMessage(user, text, extra) }),
        onResub: (user, text, _streak, _cumulative, _tier, extra) =>
          live({ kind: "sub", user, message: toAttachedMessage(user, text, extra) }),
        onSubGift: (gifter, _streak, recipient, _senderCount, _tier, extra) => {
          if (!isInSeries(extra)) live({ kind: "gift", user: gifter, recipient });
        },
        onSubMysteryGift: (gifter, count) => live({ kind: "mystery-gift", user: gifter, count }),
        onCheer: (user, text, bits, _flags, extra) =>
          live({ kind: "cheer", user, bits, message: toAttachedMessage(user, text, extra) }),
        onBan: (_username, extra) => receiveViewerDeleted(BanExtraSchema, extra),
        onTimeout: (_username, _seconds, extra) => receiveViewerDeleted(SuspensionExtraSchema, extra),
        onJoin: (_user, self) => {
          if (self) log(`Tchat : #${channel} rejoint, lecture sans jeton.`);
        },
        onConnected: (address, port) => log(`Tchat : connecté à Twitch (${address}:${port}).`),
        onReconnect: (count) => log(`Tchat : connexion perdue, nouvel essai automatique (${count}).`),
        onError: (error) =>
          log(
            `Tchat : ComfyJS signale une erreur : ${error instanceof Error ? error.message : String(error)}`,
          ),
      });
      log(`Tchat : connexion à #${channel}…`);
      socket.connect(channel);
    },
    stop() {
      if (!isStarted) return;
      isStarted = false;
      socket.disconnect();
    },
  };
}
