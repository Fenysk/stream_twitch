// L'éditeur d'un clip de l'émission (confirmé) : le lecteur lit le clip brut d'origine (dans Traités), les poignées sont sur le début
// et la fin enregistrés, le titre et la phrase sont remplis. « Enregistrer » réécrit le JSON, et recode depuis le clip brut quand le
// début ou la fin ont changé. « Retirer de l'émission » range le clip dans Traités. Sans clip brut, la vidéo confirmée se lit, les
// poignées sont désactivées et seuls le titre, la phrase et les rires se modifient (les rires ne demandent aucun recodage).

import { CircleMinus, Save } from "lucide-react";
import { isSameTrim } from "../../domain/clip.rules";
import type { ConfirmedSummary, ConfirmRequest } from "../../domain/clip.schema";
import { DEFAULT_LAUGH_FADER } from "../../domain/laugh.rules";
import type { SoundSummary } from "../../domain/sound.schema";
import { toProcessedVideoUrl } from "../clips-api";
import { toShowVideoUrl } from "../show-api";
import { ClipWorkbench } from "./clip-workbench";

type ConfirmedClipEditorProps = {
  clip: ConfirmedSummary;
  // Les sounds de la soundboard (`null` tant qu'elle n'est pas lue), de quoi poser les rires.
  sounds: readonly SoundSummary[] | null;
  // Un clip (celui-ci ou un autre) est en cours de traitement : rien ne démarre.
  isWorking: boolean;
  // Rendent le refus du serveur à montrer, ou `null` quand c'est fait.
  onRevise: (request: ConfirmRequest) => Promise<string | null>;
  onWithdraw: (name: string) => Promise<string | null>;
  // Le clip est enregistré ou retiré : l'onglet ferme l'éditeur et le dit.
  onDone: (notice: string) => void;
};

const RAW_MISSING =
  "Le clip brut d'origine n'est plus dans Traités : le début et la fin ne se changent plus, seuls le titre et la phrase se modifient.";

export const ConfirmedClipEditor = ({
  clip,
  sounds,
  isWorking,
  onRevise,
  onWithdraw,
  onDone,
}: ConfirmedClipEditorProps) => {
  const hasRaw = clip.processedName !== null;
  const saved = { start: clip.start, end: clip.end };
  // Sans clip brut, la vidéo lue commence au début gardé : les rires (en secondes du clip brut) se placent à `start` près.
  const lockedTrim = { start: 0, end: clip.end - clip.start };
  return (
    <ClipWorkbench
      name={clip.processedName ?? clip.name}
      src={
        hasRaw
          ? toProcessedVideoUrl(clip.processedName ?? clip.name)
          : toShowVideoUrl(clip.name, clip.version)
      }
      initialTitle={clip.title}
      initialPhrase={clip.phrase}
      initialLaughs={clip.laughs}
      initialLaughFader={clip.laughFader ?? DEFAULT_LAUGH_FADER}
      videoStart={hasRaw ? 0 : clip.start}
      sounds={sounds}
      initialTrim={hasRaw ? saved : lockedTrim}
      lockedMessage={hasRaw ? undefined : RAW_MISSING}
      titleHint="Obligatoire"
      isWorking={isWorking}
      onDone={onDone}
      primary={{
        label: "Enregistrer",
        icon: Save,
        working:
          "Enregistrement en cours (un nouveau début ou une nouvelle fin recode le clip : jusqu'à une minute)…",
        // Sans clip brut, le début et la fin restent ceux d'avant : le serveur ne recode pas.
        run: ({ title, phrase, trim, laughs, laughFader }) => {
          const next = hasRaw ? trim : saved;
          return onRevise({
            name: clip.name,
            title,
            phrase,
            start: next.start,
            end: next.end,
            laughs,
            laughFader,
          });
        },
        notice: ({ title, trim }) =>
          hasRaw && !isSameTrim(trim, saved)
            ? `« ${title.trim()} » est recodé et enregistré.`
            : `« ${title.trim()} » est enregistré.`,
      }}
      secondary={{
        label: "Retirer de l'émission",
        icon: CircleMinus,
        working: "Le clip part dans Traités…",
        run: () => onWithdraw(clip.name),
        notice: () => `« ${clip.title} » est retiré de l'émission, rangé dans Traités.`,
      }}
    />
  );
};
