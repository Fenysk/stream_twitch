import { ArrowDown } from "lucide-react";
import type { PhoneChatState } from "../../domain/chat-phone.rules";
import { toPhoneChatMark } from "../../domain/chat-phone.rules";
import { ChatLine } from "../chat/chat-line";
import { Button } from "../design/button";
import { toMarkText } from "./control-view";
import { useStickyBottom } from "./use-sticky-bottom";

// Le tchat du téléphone : celui que le streamer voit sur Twitch, pas celui d'OBS. Tous les messages, du plus ancien en haut au plus récent
// en bas, avec défilement et sans limite. Un message qu'OBS ne montre pas (commande, bot) est atténué, sans texte ; un message supprimé
// reste, barré et atténué, avec « supprimé ». La zone reste collée en bas tant qu'on y est ; remonté lire, rien ne bouge et « Nouveaux
// messages » ramène en bas d'un toucher. Le bas de la zone garde la place du bouton « Écrire » (control-role.css).
export const ChatLog = ({ state }: { state: PhoneChatState }) => {
  const { messages, look } = state;
  const { scroller, content, hasNews, onScroll, jump } = useStickyBottom(messages.length);
  return (
    <div className="chat-log">
      <div ref={scroller} className="chat-log-scroll" role="log" aria-live="off" onScroll={onScroll}>
        <ol ref={content} className="chat-log-list">
          {messages.map((entry) => {
            const mark = toPhoneChatMark(entry, look);
            const markText = toMarkText(mark);
            return (
              <li key={entry.message.id} className="chat-log-row" data-mark={mark ?? undefined}>
                <ChatLine message={entry.message} className="chat-log-line" />
                {markText && <span className="chat-log-mark lp-type-caption">{markText}</span>}
              </li>
            );
          })}
        </ol>
      </div>
      {hasNews && (
        <div className="chat-log-news">
          <Button label="Nouveaux messages" icon={ArrowDown} variant="primary" onPress={jump} />
        </div>
      )}
    </div>
  );
};
