import type { ChatMessage } from "./chat.schema";
import type { RawMessage } from "./chat.types";
import { isChatColor } from "./chat-color.rules";
import { toFragments } from "./chat-fragments.rules";

export type HiddenKind = "command" | "bot";

// Une commande ou un bot : l'affichage le masque, et le renard ne le lit pas. `bots` : les noms de compte en minuscules
// (toChatBots).
export const toHiddenKind = (raw: RawMessage, bots: readonly string[]): HiddenKind | null => {
  if (raw.isCommand) return "command";
  return bots.includes(raw.viewerLogin.toLowerCase()) ? "bot" : null;
};

// Une commande ou un bot est masqué : la page le montre si le réglage le demande.
export const toChatMessage = (raw: RawMessage, bots: readonly string[], receivedAt: number): ChatMessage => ({
  id: raw.id,
  nickname: raw.nickname,
  color: isChatColor(raw.color) ? raw.color : null,
  fragments: toFragments(raw.text, raw.emotes),
  isHidden: toHiddenKind(raw, bots) !== null,
  receivedAt,
});
