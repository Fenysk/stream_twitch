import type { ChatLook } from "./chat.schema";
import type { Settings } from "./settings.schema";

// Ce que le tchat applique quand settings.json ne dit rien ; settings.json les écrit aussi, et un test garde les deux d'accord.
export const DEFAULT_CHAT_LOOK: ChatLook = {
  style: "pill",
  opacity: 85,
  textSize: 20,
  duration: 60,
  maxMessages: 8,
  animation: "rise",
  shouldShowHidden: false,
};

const DEFAULT_CHAT_CHANNEL = "fenysk";

// Les réglages du tchat dans Settings : la chaîne, les bots, et les sept réglages de l'onglet.
export type ChatSettings = Pick<
  Settings,
  | "chatChannel"
  | "chatBots"
  | "chatStyle"
  | "chatOpacity"
  | "chatTextSize"
  | "chatDuration"
  | "chatMaxMessages"
  | "chatAnimation"
  | "chatShouldShowHidden"
>;

export const toChatLook = (settings: ChatSettings): ChatLook => ({
  style: settings.chatStyle ?? DEFAULT_CHAT_LOOK.style,
  opacity: settings.chatOpacity ?? DEFAULT_CHAT_LOOK.opacity,
  textSize: settings.chatTextSize ?? DEFAULT_CHAT_LOOK.textSize,
  duration: settings.chatDuration ?? DEFAULT_CHAT_LOOK.duration,
  maxMessages: settings.chatMaxMessages ?? DEFAULT_CHAT_LOOK.maxMessages,
  animation: settings.chatAnimation ?? DEFAULT_CHAT_LOOK.animation,
  shouldShowHidden: settings.chatShouldShowHidden ?? DEFAULT_CHAT_LOOK.shouldShowHidden,
});

export const isSameChatLook = (first: ChatLook, second: ChatLook): boolean =>
  first.style === second.style &&
  first.opacity === second.opacity &&
  first.textSize === second.textSize &&
  first.duration === second.duration &&
  first.maxMessages === second.maxMessages &&
  first.animation === second.animation &&
  first.shouldShowHidden === second.shouldShowHidden;

// Les noms de compte des bots, en minuscules : c'est ainsi que Twitch les écrit.
export const toChatBots = (settings: ChatSettings): string[] =>
  (settings.chatBots ?? []).map((bot) => bot.toLowerCase());

export const toChatChannel = (settings: ChatSettings): string => settings.chatChannel ?? DEFAULT_CHAT_CHANNEL;
