import { type Ref, useRef } from "react";
import type { ChatAnimation, ChatLook, ChatMessage } from "../../domain/chat.schema";
import type { ChatRow } from "../../domain/chat-rows.rules";
import { type CssVariables, classNames } from "../design/class-names";
import { ChatLine } from "./chat-line";
import { useChatRows } from "./use-chat-rows";

// `screen` : la page de la source OBS, qui remplit la fenêtre. `box` : la même colonne à la taille de la source (l'aperçu des réglages).
export type ChatLayout = "screen" | "box";

// L'apparition du message, selon le réglage : trois mouvements de chat.css, et le fondu discret du design system (arrival.css).
const ANIMATION_CLASS: Record<ChatAnimation, string> = {
  rise: "chat-in-rise",
  pop: "chat-in-pop",
  side: "chat-in-side",
  fade: "lp-arrives",
};

type ChatRowsProps = { rows: ChatRow[]; look: ChatLook; layout: ChatLayout; ref?: Ref<HTMLDivElement> };

// La colonne telle qu'elle se dessine pour des rangées données. Toujours sur les tokens sombres : un tchat se lit sur une scène, pas sur le thème de la page.
export const ChatRows = ({ rows, look, layout, ref }: ChatRowsProps) => {
  const variables: CssVariables = {
    "--pill-opacity": `${look.opacity}%`,
    "--chat-size": `${look.textSize}px`,
  };
  const lineClass = classNames(
    "chat-line",
    look.style === "pill" && "lp-pill",
    ANIMATION_CLASS[look.animation],
  );
  return (
    <div
      ref={ref}
      className="chat-column"
      data-appearance="dark"
      data-layout={layout}
      data-style={look.style}
      data-empty={rows.length === 0 ? "" : undefined}
      style={variables}
    >
      <div className={classNames("chat-panel", look.style === "panel" && "lp-pill")}>
        <ol className="chat-rows">
          {rows.map(({ message, leftAt }) => (
            <li key={message.id} className="chat-row" data-leaving={leftAt === null ? undefined : ""}>
              <div className="chat-row-clip">
                <ChatLine message={message} className={lineClass} />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
};

type ChatColumnProps = { messages: ChatMessage[]; look: ChatLook; layout: ChatLayout };

// Les messages reçus, montrés selon l'allure : la durée, le maximum et le filtre des commandes et des bots décident des rangées.
export const ChatColumn = ({ messages, look, layout }: ChatColumnProps) => {
  const column = useRef<HTMLDivElement>(null);
  const rows = useChatRows(messages, look, column);
  return <ChatRows ref={column} rows={rows} look={look} layout={layout} />;
};
