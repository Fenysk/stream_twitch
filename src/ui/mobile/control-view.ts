// Ce que la régie écrit dans son bandeau et ce que le chat du téléphone écrit à côté d'un message : des textes et des nombres, sans le
// navigateur.

import type { PhoneChatMark } from "../../domain/chat-phone.rules";
import { PC_MIC_ID, toDurationText, toLiveMic } from "../../domain/control.rules";
import type { ControlState } from "../../domain/control.schema";
import type { ViewersState } from "../../domain/viewers.types";

const NO_VALUE = "–";

// « Live 1:42 » pendant la diffusion d'OBS, « Hors ligne » sinon. `elapsedMs` : le temps passé depuis que le serveur a envoyé l'état.
export const toLiveText = ({ broadcast }: ControlState, elapsedMs: number): string =>
  broadcast.isLive ? `Live ${toDurationText(broadcast.durationMs + Math.max(0, elapsedMs))}` : "Hors ligne";

// Le nombre de viewers, ou un tiret sobre : le live est hors ligne, ou Twitch n'a pas répondu (le titre le dit au toucher).
export const toViewersText = (viewers: ViewersState): { text: string; title: string } => {
  if (viewers.kind === "live") return { text: String(viewers.count), title: "Viewers" };
  return {
    text: NO_VALUE,
    title: viewers.kind === "offline" ? "Live hors ligne" : "Nombre de viewers inconnu",
  };
};

// La scène à l'antenne ; OBS non joint ou sans scène, un tiret.
export const toSceneText = ({ isLinked, scene }: ControlState): string => {
  if (!isLinked) return "OBS non joint";
  return scene ?? NO_VALUE;
};

// Le micro du live : « Micro : PC », « Micro : Caméra 1 »… ; aucun micro ouvert, « Micro : coupé » ; OBS non joint ou rien de connu, un tiret.
export const toMicText = ({ isLinked, mics }: ControlState): string => {
  const live = toLiveMic(mics);
  if (live) return `Micro : ${live.id === PC_MIC_ID ? "PC" : live.label}`;
  return isLinked && mics.some(({ isAvailable }) => isAvailable) ? "Micro : coupé" : `Micro : ${NO_VALUE}`;
};

// L'image : « Image : PC », « Image : Caméra 1 », « Image : Tête » ; aucun membre à l'image, un tiret. Sans place caméra, la pastille n'est pas
// montrée (voir `hasPicture`).
export const toPictureText = ({ picture }: ControlState): string =>
  `Image : ${picture.members.find(({ id }) => id === picture.currentId)?.label ?? NO_VALUE}`;

// OBS a une place caméra à montrer : la pastille de l'image n'existe que dans ce cas.
export const hasPicture = ({ picture }: ControlState): boolean => picture.members.length > 0;

// Le nombre de personnes de la liste des viewers : « 0 personne », « 1 personne », « 12 personnes ».
export const toChatViewersCountText = (count: number): string => `${count} personne${count > 1 ? "s" : ""}`;

// Ce que la liste des viewers précise sous son nombre : Twitch ne liste que les viewers connectés à Twitch, le nombre du bandeau les compte tous.
export const CHAT_VIEWERS_NOTE =
  "Les viewers qui ne sont pas connectés à Twitch n'apparaissent pas : le nombre du bandeau compte tout le monde.";

// Ce que le chat du téléphone écrit à côté d'un message marqué (voir toPhoneChatMark) : « supprimé » pour un message supprimé. Un message
// que seul le téléphone montre (masqué dans OBS) n'a pas de texte, il est seulement atténué ; rien non plus pour un message qu'OBS montre.
export const toMarkText = (mark: PhoneChatMark): string => (mark === "deleted" ? "supprimé" : "");
