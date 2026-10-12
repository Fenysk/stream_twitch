import { Fragment } from "react";
import type { ChatFragment, ChatMessage } from "../../domain/chat.schema";
import { toReadableColor } from "../../domain/chat-color.rules";
import { toEmoteUrl } from "./emote-url";

// Chaque fragment commence à une position différente dans le message : c'est sa clé, stable d'un rendu à l'autre.
const toKeyedFragments = (fragments: ChatFragment[]): { key: number; fragment: ChatFragment }[] => {
  let position = 0;
  return fragments.map((fragment) => {
    const key = position;
    position += fragment.kind === "text" ? fragment.text.length : fragment.name.length;
    return { key, fragment };
  });
};

type ChatLineProps = { message: ChatMessage; className: string };

// Un message : le nickname dans sa couleur Twitch (éclaircie seulement si elle ne se lit pas), puis le texte et les emotes en images.
export const ChatLine = ({ message, className }: ChatLineProps) => {
  const color = toReadableColor(message.color);
  return (
    <p className={className}>
      <span className="chat-nickname" style={color ? { color } : undefined}>
        {message.nickname}
      </span>
      {toKeyedFragments(message.fragments).map(({ key, fragment }) => (
        <Fragment key={key}>
          {fragment.kind === "emote" ? (
            <img className="chat-emote" src={toEmoteUrl(fragment.id)} alt={fragment.name} draggable={false} />
          ) : (
            fragment.text
          )}
        </Fragment>
      ))}
    </p>
  );
};
