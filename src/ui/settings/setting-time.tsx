// Un réglage d'heure d'un onglet : un champ « HH:MM », son aide dessous, et le refus du serveur s'il y en a un. Il s'applique quand
// le champ perd le focus (pas de bouton Enregistrer) ; un refus laisse ce qu'on a écrit, pour le corriger.

import { useState } from "react";
import type { EditableSettings } from "../../domain/settings.schema";
import { TextField } from "../design/text-field";
import type { TimeCodec, TimeSpec } from "./head-fields";
import type { UseSettings } from "./use-settings";

type SettingTimeProps = { spec: TimeSpec; settings: UseSettings; effective: EditableSettings };

const SAME_TEXT: TimeCodec = { toShown: (saved) => saved, toSaved: (typed) => typed, refusal: "" };

export const SettingTime = ({ spec, settings, effective }: SettingTimeProps) => {
  const codec = spec.codec ?? SAME_TEXT;
  const saved = codec.toShown(effective[spec.key] ?? "");
  // Ce qu'on est en train d'écrire ; `null` : rien en cours, le champ montre l'heure qui s'applique.
  const [draft, setDraft] = useState<string | null>(null);
  // L'heure tapée que le codec refuse, avant même d'écrire au serveur.
  const [refusal, setRefusal] = useState<string | null>(null);
  const error = refusal ?? settings.errors.byKey[spec.key];

  const commit = async () => {
    if (draft === null) return;
    const text = draft.trim();
    if (text !== saved) {
      const value = codec.toSaved(text, Date.now());
      if (value === null) {
        setRefusal(codec.refusal);
        return;
      }
      if (!(await settings.change({ [spec.key]: value }))) return;
    }
    setDraft(null);
  };

  const type = (text: string) => {
    setRefusal(null);
    setDraft(text);
  };

  return (
    <div className="settings-time">
      <TextField
        label={spec.label}
        value={draft ?? saved}
        placeholder="HH:MM"
        maxLength={5}
        onInput={type}
        onCommit={() => void commit()}
      />
      <p className="lp-type-caption lp-muted">{spec.help}</p>
      {error && (
        <p role="alert" className="lp-type-caption lp-danger">
          {error}
        </p>
      )}
    </div>
  );
};
