import { Pencil } from "lucide-react";
import { useState } from "react";
import { Button } from "../design/button";
import { ChatComposer } from "./chat-composer";
import { ChatLog } from "./chat-log";
import { usePhoneChat } from "./use-phone-chat";

// Le chat du téléphone (Régie et Selfie) : celui que le streamer voit sur Twitch, tous les messages et sans limite (`ChatLog`). Le bouton
// « Écrire » est dans la boîte du chat, en bas à droite, en bouton du design system comme « Régie » ; il ouvre le champ sous la boîte, qui
// remplace le bouton le temps de l'écriture. Les messages viennent du flux du chat.
export const ControlChat = () => {
  const state = usePhoneChat();
  const [isWriting, setIsWriting] = useState(false);
  return (
    <section className="control-chat" aria-label="Chat" data-writing={isWriting ? "" : undefined}>
      <div className="control-chat-feed">
        <ChatLog state={state} />
        {!isWriting && (
          <div className="chat-write">
            <Button label="Écrire" icon={Pencil} variant="primary" onPress={() => setIsWriting(true)} />
          </div>
        )}
      </div>
      {isWriting && <ChatComposer onClose={() => setIsWriting(false)} />}
    </section>
  );
};
