import { RefreshCw } from "lucide-react";
import { Button } from "../design/button";
import { CHAT_VIEWERS_NOTE, toChatViewersCountText } from "./control-view";
import type { ChatViewersView } from "./use-chat-viewers";

type ChatViewersPanelProps = { view: ChatViewersView; onRefresh: () => void };

// Le contenu de la liste des viewers : en tête le nombre de personnes listées (« 12 personnes ») et un bouton pour rafraîchir, puis la ligne qui
// dit que les viewers non connectés à Twitch n'y sont pas, puis les pseudos (triés par le serveur), ou « Chargement… », ou le refus.
export const ChatViewersPanel = ({ view, onRefresh }: ChatViewersPanelProps) => (
  <>
    <header className="control-viewers-head">
      <h2 className="lp-type-heading control-drawer-title">
        {view.kind === "ready" ? toChatViewersCountText(view.chatViewers.length) : "Viewers du tchat"}
      </h2>
      <Button
        icon={RefreshCw}
        title="Rafraîchir la liste"
        variant="ghost"
        isDisabled={view.kind === "loading"}
        onPress={onRefresh}
      />
    </header>
    <p className="lp-type-caption lp-muted control-viewers-note">{CHAT_VIEWERS_NOTE}</p>
    {view.kind === "loading" && (
      <p className="lp-type-body lp-muted control-empty" role="status">
        Chargement…
      </p>
    )}
    {view.kind === "failed" && (
      <p className="lp-type-body lp-danger control-empty" role="alert">
        {view.message}
      </p>
    )}
    {view.kind === "ready" &&
      (view.chatViewers.length === 0 ? (
        <p className="lp-type-body lp-muted control-empty" role="status">
          Personne n'est connecté au tchat.
        </p>
      ) : (
        <ol className="control-chatViewers">
          {view.chatViewers.map(({ id, nickname }) => (
            <li key={id} className="lp-type-body">
              {nickname}
            </li>
          ))}
        </ol>
      ))}
  </>
);
