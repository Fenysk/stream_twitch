import type { ChatMessage } from "./chat.schema";
import type { RawMessage } from "./chat.types";
import { isChatColor } from "./chat-color.rules";
import { toFragments } from "./chat-fragments.rules";

// `bots` : les noms de compte en minuscules (toChatBots). Une commande ou un bot est masqué : la page le montre si le réglage le demande.
export const toChatMessage = (raw: RawMessage, bots: readonly string[], receivedAt: number): ChatMessage => ({
  id: raw.id,
  nickname: raw.nickname,
  color: isChatColor(raw.color) ? raw.color : null,
  fragments: toFragments(raw.text, raw.emotes),
  isHidden: raw.isCommand || bots.includes(raw.viewerLogin.toLowerCase()),
  receivedAt,
});
