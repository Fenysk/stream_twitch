// Le plan de travail d'un clip, commun à un clip brut (valider ou jeter) et à un clip confirmé (enregistrer ou retirer de l'émission) :
// le lecteur, la timeline à pistes (la coupe : début et fin gardés, et les rires), le titre et les phrases de début et de fin de
// Jean-Renard, puis deux actions au choix de l'appelant. Une action rend le refus du serveur à montrer, ou `null` quand c'est fait.

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { TITLE_MAX_LENGTH } from "../../domain/clip.rules";
import type { ClipLaugh } from "../../domain/clip.schema";
import type { SoundSummary } from "../../domain/sound.schema";
import { type Trim, toEndAt, toStartAt, toStepIndex, toStepMiddle } from "../../domain/trim.rules";
import { Button, type ButtonIcon, type ButtonVariant } from "../design/button";
import { TextArea } from "../design/text-area";
import { TextField } from "../design/text-field";
import { ClipPlayer } from "./clip-player";
import { ClipTimelineSection } from "./clip-timeline-section";
import { useClipKeys } from "./use-clip-keys";
import { useClipLaughs } from "./use-clip-laughs";
import { useClipVideo } from "./use-clip-video";
import { useLaughFader } from "./use-laugh-fader";
import { useLaughPreview } from "./use-laugh-preview";

// Ce qu'Alexis a écrit et choisi au moment d'une action. `laughs` : les rires posés (leur instant en secondes du clip brut, et le sound) ;
// `laughFader` : leur volume, de 0 à 100.
export type EditorValues = {
  title: string;
  phrase: string;
  endPhrase: string;
  trim: Trim;
  laughs: ClipLaugh[];
  laughFader: number;
};

export type EditorAction = {
  label: string;
  icon: ButtonIcon;
  variant?: ButtonVariant;
  // Le texte pendant que le serveur travaille.
  working: string;
  // Rend le refus du serveur à montrer, ou `null` quand c'est fait.
  run: (values: EditorValues) => Promise<string | null>;
  // Ce que l'onglet dit une fois fait.
  notice: (values: EditorValues) => string;
};

type ClipWorkbenchProps = {
  // Le clip et l'adresse de sa vidéo.
  name: string;
  src: string;
  initialTitle: string;
  initialPhrase: string;
  initialEndPhrase: string;
  // Les rires déjà posés sur le clip ; sans eux, aucun.
  initialLaughs?: readonly ClipLaugh[] | undefined;
  // Le volume des rires déjà enregistré (0 à 100) ; sans lui (un clip brut), le dernier volume choisi, et 100 au tout début.
  initialLaughFader?: number | undefined;
  // L'instant du clip brut où la vidéo lue commence : 0 (le défaut) pour le clip brut, le début gardé quand la vidéo lue est le clip
  // confirmé (les rires restent en secondes du clip brut).
  videoStart?: number | undefined;
  // Les sounds de la soundboard (`null` tant qu'elle n'est pas lue), de quoi poser les rires.
  sounds: readonly SoundSummary[] | null;
  // Le début et la fin déjà choisis ; sans eux, tout le clip.
  initialTrim?: Trim | undefined;
  // Le texte dit pourquoi le début et la fin ne se changent pas : les poignées sont alors désactivées.
  lockedMessage?: string | undefined;
  titleHint: string;
  // Un clip (celui-ci ou un autre) est en cours de traitement : rien ne démarre.
  isWorking: boolean;
  // La première action demande un titre.
  primary: EditorAction;
  secondary: EditorAction;
  // Le clip est rangé : l'onglet ferme l'éditeur et le dit.
  onDone: (notice: string) => void;
};

type Which = "primary" | "secondary";

const SHORTCUTS_TEXT =
  "Raccourcis : I pose le début, O la fin, R un rire à la position de lecture, Suppr retire le rire choisi, ← et → avancent d'une image (en pause), Espace lit ou arrête.";

export const ClipWorkbench = ({
  name,
  src,
  initialTitle,
  initialPhrase,
  initialEndPhrase,
  initialLaughs,
  initialLaughFader,
  videoStart = 0,
  sounds,
  initialTrim,
  lockedMessage,
  titleHint,
  isWorking,
  primary,
  secondary,
  onDone,
}: ClipWorkbenchProps) => {
  const video = useClipVideo();
  const isTrimLocked = lockedMessage !== undefined;
  // Tant qu'Alexis n'a rien choisi, le début et la fin sont ceux d'avant, ou tout le clip.
  const [chosen, setChosen] = useState<Trim | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [phrase, setPhrase] = useState(initialPhrase);
  const [endPhrase, setEndPhrase] = useState(initialEndPhrase);
  const [which, setWhich] = useState<Which | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const { duration } = video;
  const trim = chosen ?? initialTrim ?? (duration === null ? null : { start: 0, end: duration });
  const kept = trim && { start: trim.start + videoStart, end: trim.end + videoStart };
  const laughs = useClipLaughs({ initial: initialLaughs, sounds, video, kept, origin: videoStart });
  const laughFader = useLaughFader(initialLaughFader);
  useLaughPreview({
    video,
    laughs: laughs.requests,
    usedSounds: laughs.usedSounds,
    seconds: laughs.seconds,
    laughFader: laughFader.fader,
    kept,
    origin: videoStart,
  });
  useClipKeys({
    video,
    trim,
    onTrimChange: setChosen,
    onLaugh: laughs.create,
    onDelete: laughs.delete,
    isEnabled: !isWorking,
    isTrimLocked,
  });

  // Glisser une poignée montre l'image où elle se pose : la première gardée pour le début, la dernière gardée pour la fin.
  const moveStart = (current: Trim, time: number) => {
    const next = toStartAt(current, time);
    setChosen(next);
    video.seek(toStepMiddle(toStepIndex(next.start)));
  };
  const moveEnd = (current: Trim, time: number, total: number) => {
    const next = toEndAt(current, time, total);
    setChosen(next);
    video.seek(toStepMiddle(toStepIndex(next.end) - 1));
  };

  const run = async (kind: Which, action: EditorAction) => {
    if (!trim) return;
    const values = { title, phrase, endPhrase, trim, laughs: laughs.requests, laughFader: laughFader.fader };
    setWhich(kind);
    setRefusal(null);
    const message = await action.run(values);
    setWhich(null);
    if (message === null) onDone(action.notice(values));
    else setRefusal(message);
  };

  const working = which === null ? null : (which === "primary" ? primary : secondary).working;

  return (
    <div className="clip-editor">
      <ClipPlayer name={name} src={src} videoRef={video.ref} />
      {trim && duration !== null && (
        <ClipTimelineSection
          duration={duration}
          trim={trim}
          time={video.time}
          isTrimLocked={isTrimLocked}
          isWorking={isWorking}
          laughs={laughs}
          laughFader={laughFader.fader}
          sounds={sounds}
          onLaughFaderChange={laughFader.update}
          onSeek={video.seek}
          onStartChange={(time) => moveStart(trim, time)}
          onEndChange={(time) => moveEnd(trim, time, duration)}
          onPlayKept={() => video.playBetween(trim.start, trim.end)}
        />
      )}
      {lockedMessage && (
        <p role="status" className="lp-type-body lp-warning">
          {lockedMessage}
        </p>
      )}
      <p className="lp-type-caption lp-muted">{SHORTCUTS_TEXT}</p>
      <TextField
        label="Titre"
        value={title}
        onInput={setTitle}
        maxLength={TITLE_MAX_LENGTH}
        placeholder={titleHint}
        isDisabled={isWorking}
      />
      <TextArea
        label="Phrase de début"
        value={phrase}
        onInput={setPhrase}
        rows={2}
        placeholder="Facultatif : dite sur le carton ; vide, il se tait."
        isDisabled={isWorking}
      />
      <TextArea
        label="Phrase de fin"
        value={endPhrase}
        onInput={setEndPhrase}
        rows={2}
        placeholder="Facultatif : dite après le clip et ses rires ; vide, il se tait."
        isDisabled={isWorking}
      />
      <div className="clip-actions">
        <Button
          label={primary.label}
          icon={primary.icon}
          variant="primary"
          isDisabled={isWorking || trim === null || title.trim() === ""}
          onPress={() => void run("primary", primary)}
        />
        <Button
          label={secondary.label}
          icon={secondary.icon}
          {...(secondary.variant ? { variant: secondary.variant } : {})}
          isDisabled={isWorking}
          onPress={() => void run("secondary", secondary)}
        />
      </div>
      {working !== null && (
        <p role="status" className="clip-working lp-type-body">
          <Loader2 aria-hidden="true" className="clip-spinner" />
          {working}
        </p>
      )}
      {refusal && (
        <p role="alert" className="lp-type-body lp-danger">
          {refusal}
        </p>
      )}
    </div>
  );
};
