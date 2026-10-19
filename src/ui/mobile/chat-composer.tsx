import { X } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { CHAT_TEXT_MAX } from "../../domain/control.schema";
import { sendChatMessage } from "../control-api";
import { Button } from "../design/button";
import { toSentence } from "./control-keys";

// Le champ d'« Écrire » : pas de champ permanent, il n'existe que quand le bouton « Écrire » de la boîte du chat l'a ouvert (`ControlChat`).
// Il se met au point à l'ouverture (le clavier s'ouvre avec lui), avec un bouton Envoyer ; après un envoi réussi, il se referme
// (`onClose`). Le message part au nom du compte Twitch connecté ; un refus (il faut reconnecter Twitch) s'écrit sous le champ, qui reste
// ouvert avec le message.
export const ChatComposer = ({ onClose }: { onClose: () => void }) => {
  const [text, setText] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);

  // L'ouverture vient d'un toucher : la mise au point dans la même foulée ouvre le clavier de l'iPhone.
  useEffect(() => {
    field.current?.focus();
  }, []);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (text.trim() === "" || isBusy) return;
    setIsBusy(true);
    const answer = await sendChatMessage(text);
    setIsBusy(false);
    if (answer.ok) onClose();
    else setRefusal(toSentence(answer.message));
  };

  return (
    <form className="chat-composer" onSubmit={(event) => void submit(event)}>
      <div className="chat-composer-row">
        <input
          ref={field}
          className="lp-input lp-type-title"
          type="text"
          enterKeyHint="send"
          autoComplete="off"
          maxLength={CHAT_TEXT_MAX}
          aria-label="Message au chat"
          placeholder="Ton message au chat"
          value={text}
          disabled={isBusy}
          onChange={(change) => {
            setText(change.target.value);
            setRefusal(null);
          }}
        />
        <Button
          label="Envoyer"
          variant="primary"
          isDisabled={isBusy || text.trim() === ""}
          onPress={() => void submit()}
        />
        <Button icon={X} title="Fermer le champ" variant="ghost" isDisabled={isBusy} onPress={onClose} />
      </div>
      {refusal && (
        <p role="alert" className="lp-type-caption lp-warning">
          {refusal}
        </p>
      )}
    </form>
  );
};
