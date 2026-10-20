import { toCameraName } from "./camera.rules";
import type { ControlMic, ControlState } from "./control.schema";

// Ce qu'OBS dit des micros de la régie : la coupure du mic du PC (`null` : OBS ne connaît pas cette entrée), et la source navigateur mic
// (`/camera/<n>/mic`) de chaque caméra, avec sa coupure. Une caméra sans source mic dans OBS n'y est pas.
export type ObsMics = {
  isPcMuted: boolean | null;
  cameras: readonly { number: number; input: string; isMuted: boolean }[];
};

// Un micro que la régie sait ouvrir : le mic du PC (`pc`) ou celui d'une caméra connectée (`camera-3`). `input` : son entrée dans
// OBS, `null` quand OBS ne la connaît pas ; sa coupure est alors tenue pour vraie.
export type MicSource = { id: string; label: string; input: string | null; isMuted: boolean };

export const PC_MIC_ID = "pc";
const PC_MIC_LABEL = "Micro du PC";

// « Muet » : le choix qui ferme tous les micros. Un identifiant réservé, dans la même demande que le choix d'un micro (`POST /api/obs/mic`) ;
// ni le PC (`pc`) ni une caméra (`camera-3`) ne le portent.
export const MUTE_MIC_ID = "mute";

export const toCameraMicId = (number: number): string => `camera-${number}`;

// Les micros de la régie : celui du PC, puis celui de chaque caméra connectée, du plus petit numéro au plus grand.
export const toMicSources = (pcName: string, obs: ObsMics, connected: readonly number[]): MicSource[] => [
  {
    id: PC_MIC_ID,
    label: PC_MIC_LABEL,
    input: obs.isPcMuted === null ? null : pcName,
    isMuted: obs.isPcMuted ?? true,
  },
  ...[...new Set(connected)]
    .sort((a, b) => a - b)
    .map((number) => {
      const camera = obs.cameras.find((candidate) => candidate.number === number);
      return {
        id: toCameraMicId(number),
        label: toCameraName(number),
        input: camera?.input ?? null,
        isMuted: camera?.isMuted ?? true,
      };
    }),
];

// Ce que la régie montre : un micro est ouvert quand OBS le connaît et ne l'a pas coupé.
export const toControlMics = (sources: readonly MicSource[]): ControlMic[] =>
  sources.map(({ id, label, input, isMuted }) => ({
    id,
    label,
    isOpen: input !== null && !isMuted,
    isAvailable: input !== null,
  }));

// Le micro du live : le premier micro ouvert, celui du PC avant les caméras (l'ordre de `mics`), comme `toListenedInput`. Un seul est ouvert
// quand la régie ouvre un micro ; si OBS en laisse plusieurs ouverts à la main, c'est le premier que la tête et Jean-Renard écoutent. Aucun
// ouvert : `null`.
export const toLiveMic = (mics: readonly ControlMic[]): ControlMic | null =>
  mics.find(({ isOpen }) => isOpen) ?? null;

// Le bouton micro d'un téléphone qui filme prend le micro et ne le rend jamais (le menu des micros de la régie le rend au PC) : un toucher
// demande toujours le micro de sa caméra, même s'il est déjà celui du live (la demande est sans effet de bord et corrige un état périmé).
// Rend le micro à ouvrir (`camera-3`), ou `null` quand le téléphone n'a pas de numéro (le serveur ne l'a pas encore donné).
export const toTakenMicId = (number: number | null): string | null =>
  number === null ? null : toCameraMicId(number);

// Muet : OBS est joint, il connaît des micros, et aucun n'est ouvert. OBS non joint ou rien de connu n'est pas Muet : on ne sait pas.
export const isMicMuted = ({ isLinked, mics }: Pick<ControlState, "isLinked" | "mics">): boolean =>
  isLinked && mics.some(({ isAvailable }) => isAvailable) && toLiveMic(mics) === null;

// Rien ne s'entend : Muet, et aucune source mic de caméra ouverte dans OBS (celle d'un téléphone parti n'est plus dans `mics`). C'est l'état
// où rien ne rouvre un micro tout seul : seul un choix de micro, ou une entrée rouverte à la main dans OBS, en sort.
export const isMicSilent = (
  state: Pick<ControlState, "isLinked" | "mics">,
  cameras: ObsMics["cameras"],
): boolean => isMicMuted(state) && cameras.every(({ isMuted }) => isMuted);

// Ce téléphone, de ce numéro, est-il le micro du live ?
export const isLiveMicOf = (mics: readonly ControlMic[], number: number | null): boolean =>
  number !== null && toLiveMic(mics)?.id === toCameraMicId(number);

// L'entrée que la tête et Jean-Renard écoutent : celle du premier micro ouvert, celui du PC avant les caméras. Sinon la source mic encore
// ouverte dans OBS d'un téléphone qui vient de se déconnecter (`cameras` : toutes les sources mic d'OBS, listées ou non). Aucun ouvert :
// celle du PC, dont le silence dit que Fenysk est muet.
export const toListenedInput = (
  sources: readonly MicSource[],
  pcName: string,
  cameras: ObsMics["cameras"],
): string =>
  sources.find(({ input, isMuted }) => input !== null && !isMuted)?.input ??
  cameras.find(({ isMuted }) => !isMuted)?.input ??
  pcName;

// Choisir un micro : inconnu de la régie, sans entrée dans OBS (`unavailable`, avec son nom), à ouvrir en coupant les autres entrées
// encore ouvertes, ou Muet (`mute`) : toutes les entrées ouvertes se coupent, aucune ne s'ouvre.
export type MicPlan =
  | { kind: "unknown" }
  | { kind: "unavailable"; label: string }
  | { kind: "open"; label: string; input: string; toMute: string[] }
  | { kind: "mute"; toMute: string[] };

export const toMicPlan = (sources: readonly MicSource[], id: string): MicPlan => {
  if (id === MUTE_MIC_ID) {
    return {
      kind: "mute",
      toMute: sources.flatMap(({ input, isMuted }) => (input !== null && !isMuted ? [input] : [])),
    };
  }
  const target = sources.find((source) => source.id === id);
  if (!target) return { kind: "unknown" };
  if (target.input === null) return { kind: "unavailable", label: target.label };
  const toMute = sources.flatMap((source) =>
    source.id !== id && source.input !== null && !source.isMuted ? [source.input] : [],
  );
  return { kind: "open", label: target.label, input: target.input, toMute };
};

// Les scènes imbriquées d'OBS (« Master - Tchat », « Master - Webcam »…) ne sont pas à passer à l'antenne : leur nom commence par
// « Master », sans compter la casse ni les espaces de tête.
const MASTER_PREFIX = "master";

export const isMasterScene = (name: string): boolean =>
  name.trimStart().toLowerCase().startsWith(MASTER_PREFIX);

// Les scènes que la régie propose, dans l'ordre d'OBS : toutes sauf celles de Master.
export const toProgramScenes = (scenes: readonly string[]): string[] =>
  scenes.filter((name) => !isMasterScene(name));

const toTwoDigits = (value: number): string => String(value).padStart(2, "0");

// La durée du live : « 1:42 » sous l'heure, « 1:02:05 » au-delà.
export const toDurationText = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${hours}:${toTwoDigits(minutes)}:${toTwoDigits(seconds)}`
    : `${minutes}:${toTwoDigits(seconds)}`;
};
