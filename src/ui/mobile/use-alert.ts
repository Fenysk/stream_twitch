// Le filet de sécurité de /mobile : l'alerte à montrer sous le bandeau, une seule, quand un état est faux depuis 3 s et qu'on peut le
// corriger d'ici. Les règles (laquelle, depuis quand, pour quel rôle) sont dans le domaine (alert.rules.ts) ; ici, la mémoire que seule la
// page a (le dernier micro ouvert, l'arrêt demandé, le live qui s'arrête, le plan avant l'arrêt de la caméra), le délai de 3 s et les gestes.

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import {
  type AlertFacts,
  type AlertKind,
  type AlertSince,
  isStopAsked,
  type PlanMemory,
  type StopMemory,
  toAlert,
  toAlertDelay,
  toAlertSince,
  toAwayMic,
  toPlanMemory,
  toReopenMicId,
  toStopMemory,
} from "../../domain/alert.rules";
import { toLiveMic, toTakenMicId } from "../../domain/control.rules";
import type { ControlMic, ControlState } from "../../domain/control.schema";
import type { PhoneRole } from "../../domain/phone.schema";
import { IDLE_STANDING, type PictureStanding } from "../../domain/picture.schema";
import { updateMic } from "../control-api";
import type { ToastTone } from "../design/toast-announcement";
import type { ShownAlert } from "./alert-line";
import { toAlertActionLabel, toAlertText } from "./alert-text";
import type { CameraStatus } from "./camera-control";
import { toSentence } from "./control-keys";
import { type ControlView, isMicMuted, toMicName } from "./control-view";
import { getStopAskedAt } from "./stop-asked";
import type { CameraStream } from "./use-camera-stream";
import type { PhoneLink } from "./use-phone-link";

// Ce téléphone qui filme (Selfie, Caméra) : sa caméra (son état, et `restart` la relance), le plan et son numéro (la liaison), et le geste
// « Montrer » de son bouton.
export type AlertFilm = {
  camera: Pick<CameraStream, "status" | "restart">;
  link: Pick<PhoneLink, "standing" | "number">;
  onShow: () => void;
};

export type AlertWatch = {
  role: PhoneRole;
  // L'état de la régie et s'il est périmé : le flux du téléphone, quel que soit son rôle (la Caméra n'a pas d'état de régie).
  view: ControlView;
  // `null` à la Régie, qui ne filme pas.
  film: AlertFilm | null;
  // Un refus d'OBS (micro introuvable, OBS non joint) s'annonce par le toast de la page.
  onToast: (tone: ToastTone, text: string) => void;
};

// Le live s'est-il arrêté sans qu'on l'ait demandé ici ? Il ne se compare qu'à un état vivant : un état périmé n'apprend rien.
const useStopMemory = (isLive: boolean, canTell: boolean): { isStopped: boolean; onDismiss: () => void } => {
  const [memory, setMemory] = useState<StopMemory>({ wasLive: false, isStopped: false });
  useEffect(() => {
    if (canTell)
      setMemory((previous) => toStopMemory(previous, isLive, isStopAsked(getStopAskedAt(), Date.now())));
  }, [canTell, isLive]);
  const onDismiss = useCallback(() => setMemory((previous) => ({ ...previous, isStopped: false })), []);
  return { isStopped: memory.isStopped, onDismiss };
};

// Ce téléphone avait-il le plan quand sa caméra s'est arrêtée, et ne l'a-t-il plus (repli sur la Tête) ?
const usePlanMemory = (isCameraLive: boolean, standing: PictureStanding): boolean => {
  const [memory, setMemory] = useState<PlanMemory>({ wasCurrent: false, isPlanLost: false });
  useEffect(() => {
    setMemory((previous) => toPlanMemory(previous, isCameraLive, standing));
  }, [isCameraLive, standing]);
  return memory.isPlanLost;
};

// Le dernier micro vu ouvert : celui que « Rallumer » rouvre. Il reste quand tous les micros sont coupés.
const useLastMicId = (mics: readonly ControlMic[]): RefObject<string | null> => {
  const last = useRef<string | null>(null);
  const liveId = toLiveMic(mics)?.id ?? null;
  useEffect(() => {
    if (liveId !== null) last.current = liveId;
  }, [liveId]);
  return last;
};

// Depuis quand chaque condition est vraie, et l'heure de ce rendu. Une condition qui commence se date dans le rendu même (`toAlertSince` rend
// le même objet quand rien ne change : pas de boucle) ; un minuteur redessine à l'instant où la plus proche devient montrable, 3 s plus
// tard, sans redessiner chaque seconde.
const useAlertSince = (role: PhoneRole, facts: AlertFacts): { since: AlertSince; clock: number } => {
  const [since, setSince] = useState<AlertSince>({});
  const [, setTick] = useState(0);
  const clock = Date.now();
  const next = toAlertSince(since, facts, clock);
  if (next !== since) setSince(next);
  // Le temps qui reste change à chaque rendu tant qu'une alerte attend : le minuteur repart avec lui.
  const delayMs = toAlertDelay(role, facts, next, clock);
  useEffect(() => {
    if (delayMs === null) return;
    const timer = setTimeout(() => setTick((tick) => tick + 1), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);
  return { since: next, clock };
};

const isCameraDown = (status: CameraStatus): boolean =>
  status === "interrupted" || status === "denied" || status === "unavailable";

// L'état de la régie est vivant : le serveur a parlé, et le flux n'est pas périmé. Rien n'est vrai de la régie avant son premier état,
// ni d'un état périmé : « OBS non joint » y mentirait.
const isViewFresh = ({ receivedAt, staleAt }: ControlView): boolean =>
  receivedAt > 0 && typeof staleAt !== "number";

type FactsInput = {
  view: ControlView;
  film: AlertFilm | null;
  isStopped: boolean;
  isPlanLost: boolean;
  hasAwayMic: boolean;
};

// Les conditions de chacune des alertes, pour ce téléphone ; le rôle choisit celles qu'il montre (`toAlert`).
const toFacts = ({ view, film, isStopped, isPlanLost, hasAwayMic }: FactsInput): AlertFacts => {
  const { state, receivedAt, staleAt } = view;
  const isCameraLive = film?.camera.status === "live";
  return {
    lost: typeof staleAt === "number",
    stopped: isStopped,
    unlinked: isViewFresh(view) && !state.isLinked,
    muted: receivedAt > 0 && state.broadcast.isLive && isMicMuted(state),
    "camera-stopped": film !== null && isCameraDown(film.camera.status),
    "camera-ready": isCameraLive && isPlanLost && !film.link.standing.isCurrent,
    "mic-away": hasAwayMic,
  };
};

// Un micro à ouvrir : le refus d'OBS (micro introuvable, OBS non joint) s'annonce par le toast de la page.
const useOpenMic = (onToast: AlertWatch["onToast"]): ((id: string) => void) =>
  useCallback(
    (id) => {
      void updateMic(id).then((answer) => {
        if (!answer.ok) onToast("error", toSentence(answer.message));
      });
    },
    [onToast],
  );

type ShownInput = {
  state: ControlState;
  film: AlertFilm | null;
  lastMicId: RefObject<string | null>;
  awayMic: ControlMic | null;
  staleAt: number | null;
  mutedSince: number;
  onDismiss: () => void;
  onOpenMic: (id: string) => void;
};

// L'alerte montrée : son texte (écrit à l'heure donnée) et son bouton, d'après ce que chaque alerte sait faire.
const toShownAlert = (
  kind: AlertKind,
  { state, film, lastMicId, awayMic, staleAt, mutedSince, onDismiss, onOpenMic }: ShownInput,
): ShownAlert => {
  const presses: Record<AlertKind, (() => void) | null> = {
    lost: null,
    stopped: onDismiss,
    unlinked: null,
    muted: () => onOpenMic(toReopenMicId(state.mics, lastMicId.current)),
    "camera-stopped": film?.camera.restart ?? null,
    "camera-ready": film?.onShow ?? null,
    "mic-away": () => {
      const id = toTakenMicId(film?.link.number ?? null);
      if (id !== null) onOpenMic(id);
    },
  };
  const label = toAlertActionLabel(kind);
  const onPress = presses[kind];
  const awayLabel = awayMic === null ? "" : toMicName(awayMic);
  return {
    kind,
    text: (now) => toAlertText(kind, { mutedMs: (staleAt ?? now) - mutedSince, awayLabel }),
    action: label !== null && onPress !== null ? { label, onPress } : null,
  };
};

// L'alerte à montrer sous le bandeau de ce rôle, ou `null`.
export const useAlert = ({ role, view, film, onToast }: AlertWatch): ShownAlert | null => {
  const { state } = view;
  const staleAt = typeof view.staleAt === "number" ? view.staleAt : null;
  const standing = film?.link.standing ?? IDLE_STANDING;
  const stop = useStopMemory(state.broadcast.isLive, isViewFresh(view));
  const isPlanLost = usePlanMemory(film?.camera.status === "live", standing);
  const lastMicId = useLastMicId(state.mics);
  const onOpenMic = useOpenMic(onToast);
  const awayMic = toAwayMic(state.mics, film?.link.number ?? null, standing);
  const facts = toFacts({ view, film, isStopped: stop.isStopped, isPlanLost, hasAwayMic: awayMic !== null });
  const { since, clock } = useAlertSince(role, facts);
  const kind = toAlert(role, facts, since, clock);
  if (kind === null) return null;
  const mutedSince = since.muted ?? clock;
  return toShownAlert(kind, {
    state,
    film,
    lastMicId,
    awayMic,
    staleAt,
    mutedSince,
    onDismiss: stop.onDismiss,
    onOpenMic,
  });
};
