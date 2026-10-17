// L'éditeur d'un clip brut : « Valider » (le serveur recode la partie choisie, ~1 min pour 2 minutes) et « Jeter » (le clip brut part
// dans Traités). Le plan de travail est celui de clip-workbench.tsx.

import { Check, Trash2 } from "lucide-react";
import type { ClipSummary, ConfirmRequest } from "../../domain/clip.schema";
import type { SoundSummary } from "../../domain/sound.schema";
import { toClipVideoUrl } from "../clips-api";
import { ClipWorkbench } from "./clip-workbench";

type ClipEditorProps = {
  clip: ClipSummary;
  // Les sounds de la soundboard (`null` tant qu'elle n'est pas lue), de quoi poser les rires.
  sounds: readonly SoundSummary[] | null;
  // Un clip (celui-ci ou un autre) est en cours de traitement : rien ne démarre.
  isWorking: boolean;
  // Rendent le refus du serveur à montrer, ou `null` quand le clip est rangé.
  onConfirm: (request: ConfirmRequest) => Promise<string | null>;
  onDiscard: (name: string) => Promise<string | null>;
  // Le clip est rangé : l'onglet ferme l'éditeur et le dit.
  onDone: (notice: string) => void;
};

export const ClipEditor = ({ clip, sounds, isWorking, onConfirm, onDiscard, onDone }: ClipEditorProps) => (
  <ClipWorkbench
    name={clip.name}
    src={toClipVideoUrl(clip.name)}
    initialTitle=""
    initialPhrase=""
    sounds={sounds}
    titleHint="Obligatoire pour valider"
    isWorking={isWorking}
    onDone={onDone}
    primary={{
      label: "Valider",
      icon: Check,
      working: "Recodage en cours, jusqu'à une minute…",
      run: ({ title, phrase, trim, laughs }) =>
        onConfirm({ name: clip.name, title, phrase, start: trim.start, end: trim.end, laughs }),
      notice: ({ title }) => `« ${title.trim()} » est confirmé.`,
    }}
    secondary={{
      label: "Jeter",
      icon: Trash2,
      working: "Le clip part dans Traités…",
      run: () => onDiscard(clip.name),
      notice: () => `« ${clip.name} » est jeté, rangé dans Traités.`,
    }}
  />
);
