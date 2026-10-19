import { toCameraName, toCameraNumber, toCameraOfAddress } from "./camera.rules";
import { type ObsMics, PC_MIC_ID, toCameraMicId, toLiveMic } from "./control.rules";
import type { ControlMic } from "./control.schema";
import type { PictureStanding, PictureState } from "./picture.schema";

// La place caméra est une scène d'OBS (`cameraSlotScene`) qui contient les sources de caméra : celle du PC, celle de la tête et celle de
// chaque téléphone. Un seul est affiché à la fois, c'est l'image. Les membres se reconnaissent à ce qu'ils sont, jamais à leur nom.
export const PC_PICTURE_ID = PC_MIC_ID;
export const HEAD_PICTURE_ID = "head";

const PC_LABEL = "PC";
const HEAD_LABEL = "Tête";
const BROWSER_SOURCE_KIND = "browser_source";

// Les captures vidéo d'OBS : DirectShow (Windows), AVFoundation (macOS) et Video4Linux (Linux). Toutes sont le PC.
const VIDEO_CAPTURE_KINDS: ReadonlySet<string> = new Set([
  "dshow_input",
  "av_capture_input",
  "av_capture_input_v2",
  "v4l2_input",
]);

// Une caméra qui ne filme plus (déconnectée, page OBS sans liaison, caméra arrêtée) depuis ce temps (ms) laisse l'image à la tête.
export const PICTURE_FALLBACK_MS = 3000;

// Un élément de la place tel qu'OBS le range (GetSceneItemList) : son identifiant dans la scène, la source qu'il montre, ce que c'est
// (`inputKind` : le genre de la source, `null` pour une scène ou un groupe) et s'il est visible.
export type PictureItem = {
  id: number;
  name: string;
  kind: "input" | "scene" | "group";
  inputKind: string | null;
  isEnabled: boolean;
};

// Un membre de la place : tous les éléments qui le montrent (une source présente plusieurs fois compte une fois, ses éléments suivent
// ensemble), et s'il est visible, c'est-à-dire si l'un d'eux l'est.
export type PictureSource = {
  id: string;
  label: string;
  items: { id: number; isEnabled: boolean }[];
  isVisible: boolean;
};

// Ce qu'OBS dit de la place à la régie : chaque membre, dans l'ordre de la place, et s'il est visible.
export type ObsPictureMember = Pick<PictureSource, "id" | "label" | "isVisible">;

// La page de la tête : le chemin `/head` d'un hôte du serveur.
const isHeadAddress = (address: string | undefined, hosts: readonly string[]): boolean => {
  if (address === undefined || !URL.canParse(address)) return false;
  const { host, pathname } = new URL(address);
  return hosts.includes(host) && pathname.replace(/\/+$/, "") === "/head";
};

// Le numéro de la caméra d'un membre (`camera-3`), `null` pour le PC et la tête.
export const toPictureCameraNumber = (id: string): number | null => {
  const captured = /^camera-(\d+)$/.exec(id)?.[1];
  return captured === undefined ? null : toCameraNumber(captured);
};

export const toPictureLabel = (id: string): string => {
  if (id === PC_PICTURE_ID) return PC_LABEL;
  if (id === HEAD_PICTURE_ID) return HEAD_LABEL;
  const number = toPictureCameraNumber(id);
  return number === null ? id : toCameraName(number);
};

// Le membre qu'un élément montre : une capture vidéo est le PC, une source navigateur vers `/head` la tête, vers `/camera/<numéro>` la
// caméra de ce numéro. Tout le reste (une image, un texte, une scène) n'est pas un membre : l'appli n'y touche jamais. `address` : l'adresse
// de la source navigateur de l'élément.
export const toPictureMemberId = (
  item: PictureItem,
  address: string | undefined,
  hosts: readonly string[],
): string | null => {
  if (item.kind !== "input" || item.inputKind === null) return null;
  if (VIDEO_CAPTURE_KINDS.has(item.inputKind)) return PC_PICTURE_ID;
  if (item.inputKind !== BROWSER_SOURCE_KIND) return null;
  if (isHeadAddress(address, hosts)) return HEAD_PICTURE_ID;
  const number = toCameraOfAddress(address, hosts);
  return number === null ? null : toCameraMicId(number);
};

// Les membres de la place, dans l'ordre où OBS range leurs premiers éléments. `addresses` : l'adresse de chaque source navigateur d'OBS, par
// son nom.
export const toPictureSources = (
  items: readonly PictureItem[],
  addresses: ReadonlyMap<string, string | undefined>,
  hosts: readonly string[],
): PictureSource[] => {
  const sources = new Map<string, PictureSource>();
  for (const item of items) {
    const id = toPictureMemberId(item, addresses.get(item.name), hosts);
    if (id === null) continue;
    const source = sources.get(id) ?? { id, label: toPictureLabel(id), items: [], isVisible: false };
    source.items.push({ id: item.id, isEnabled: item.isEnabled });
    source.isVisible ||= item.isEnabled;
    sources.set(id, source);
  }
  return [...sources.values()];
};

export const toObsPicture = (sources: readonly PictureSource[]): ObsPictureMember[] =>
  sources.map(({ id, label, isVisible }) => ({ id, label, isVisible }));

// Les éléments à montrer et à cacher pour que ce membre soit seul à l'image : ceux de ce membre encore cachés, et ceux des autres membres
// encore visibles. `null` : ce membre n'est pas dans la place. Les éléments qui n'en sont pas membres ne sont pas dans le plan.
export type PicturePlan = { show: number[]; hide: number[] };

export const toPicturePlan = (sources: readonly PictureSource[], id: string): PicturePlan | null => {
  const target = sources.find((source) => source.id === id);
  if (!target) return null;
  return {
    show: target.items.filter(({ isEnabled }) => !isEnabled).map((item) => item.id),
    hide: sources
      .filter((source) => source.id !== id)
      .flatMap(({ items }) => items.filter(({ isEnabled }) => isEnabled).map((item) => item.id)),
  };
};

// PC d'abord, les caméras par numéro, la tête en dernier : l'ordre du menu et celui de la touche du Stream Deck.
const toPictureRank = (id: string): number => {
  if (id === PC_PICTURE_ID) return 0;
  if (id === HEAD_PICTURE_ID) return Number.POSITIVE_INFINITY;
  return toPictureCameraNumber(id) ?? Number.MAX_SAFE_INTEGER;
};

// Le PC et la tête sont toujours disponibles : le PC parce qu'OBS ne dit pas si sa capture vidéo est muette, la tête parce qu'elle vit
// dans le serveur. Une caméra l'est quand son téléphone filme jusqu'à la page OBS (`receiving` : les numéros de ces caméras).
const isPictureAvailable = (id: string, receiving: readonly number[]): boolean => {
  const number = toPictureCameraNumber(id);
  return number === null || receiving.includes(number);
};

// L'image que la régie montre : les membres que dit OBS dans l'ordre du menu, avec leur disponibilité, et le premier membre visible dans
// l'ordre de la place quand OBS en laisse plusieurs.
export const toPictureState = (
  members: readonly ObsPictureMember[],
  receiving: readonly number[],
): PictureState => ({
  members: [...members]
    .sort((a, b) => toPictureRank(a.id) - toPictureRank(b.id))
    .map(({ id, label }) => ({ id, label, isAvailable: isPictureAvailable(id, receiving) })),
  currentId: members.find(({ isVisible }) => isVisible)?.id ?? null,
});

// Le membre qui suit l'image sur la touche du Stream Deck : PC, les caméras disponibles par numéro, la tête, puis PC. Une image inconnue
// (aucune, ou une caméra qui ne filme plus) repart du membre qui la suit dans l'ordre, ou du premier.
export const toNextPictureId = ({ members, currentId }: PictureState): string | null => {
  const from = members.findIndex(({ id }) => id === currentId);
  for (let step = 1; step <= members.length; step += 1) {
    const candidate = members[(from + step + members.length) % members.length];
    if (candidate?.isAvailable) return candidate.id;
  }
  return null;
};

// Où l'image se replie quand sa caméra ne filme plus : la tête, ou à défaut le PC ; `null` si la place n'a ni l'un ni l'autre.
export const toFallbackPictureId = ({ members }: PictureState): string | null =>
  members.find(({ id }) => id === HEAD_PICTURE_ID)?.id ??
  members.find(({ id }) => id === PC_PICTURE_ID)?.id ??
  null;

// Le membre d'un téléphone qui filme : sa propre caméra, que « Montrer » met au plan. `null` quand le serveur ne lui a pas encore donné
// de numéro.
export const toPhonePictureId = (number: number | null): string | null =>
  number === null ? null : toCameraMicId(number);

// Où en est l'image pour le téléphone de ce numéro : OBS a une place, ce téléphone est le membre à l'image, et le nom du membre qui l'est.
export const toPictureStanding = (
  { members, currentId }: PictureState,
  number: number | null,
): PictureStanding => ({
  hasPlace: members.length > 0,
  isCurrent: number !== null && currentId === toCameraMicId(number),
  shown: members.find(({ id }) => id === currentId)?.label ?? null,
});

// Le bouton qui coupe ou montre la caméra d'un téléphone. Ce téléphone n'est pas à l'image : il y passe et prend le micro du live. Il y est :
// l'image passe à la tête, mais le micro reste à ce téléphone (Alexis n'est pas au PC : la tête bouge avec sa voix) ; c'est l'exception à
// « choisir la tête rend le micro au PC », propre à ce bouton. `null` : le serveur n'a pas encore donné de numéro à ce téléphone.
export type CutRequest = { id: string; isMicKept: boolean };

export const toCutRequest = (standing: PictureStanding, number: number | null): CutRequest | null => {
  const own = toPhonePictureId(number);
  if (own === null) return null;
  return standing.isCurrent ? { id: HEAD_PICTURE_ID, isMicKept: true } : { id: own, isMicKept: false };
};

// Le bouton est-il touchable ? Il faut une place caméra, ou être déjà à l'image (de quoi la quitter).
export const canCutCamera = ({ hasPlace, isCurrent }: PictureStanding): boolean => hasPlace || isCurrent;

// Ce que dit « Arrêter de filmer » avant d'agir quand ce téléphone tient le plan ou le micro du live : il passe à la Tête, et au PC (le repli
// de `Control` après 3 s). `null` : il n'a ni l'un ni l'autre, rien ne change à l'antenne, pas de confirmation.
export const toStopFilmText = ({ isCurrent }: PictureStanding, isLiveMic: boolean): string | null => {
  const head = toPictureLabel(HEAD_PICTURE_ID);
  if (isCurrent && isLiveMic) return `Le plan passe à ${head}, le micro au PC.`;
  if (isCurrent) return `Le plan passe à ${head}.`;
  return isLiveMic ? "Le micro passe au PC." : null;
};

// Ce que l'aperçu d'un téléphone dit discrètement quand il n'a pas le plan : « Caméra cachée · Tête au plan ». `null` : rien à dire (il a
// le plan, pas de place caméra, ou personne ne l'occupe).
export const toCutNotice = ({ hasPlace, isCurrent, shown }: PictureStanding): string | null =>
  hasPlace && !isCurrent && shown !== null ? `Caméra cachée · ${shown} au plan` : null;

// Le micro du live quand c'est celui d'une caméra, même si son téléphone vient de se déconnecter (il sort alors de la liste des micros). Un
// micro ouvert est celui du live : celui d'une caméra, ou `null` pour le PC. Aucun ouvert : la caméra qui l'était (`previous`) le reste tant
// que sa source est encore ouverte dans OBS, et plus dès qu'Alexis la coupe ou ouvre un autre micro.
export const toLiveCameraMicId = (
  mics: readonly ControlMic[],
  cameras: ObsMics["cameras"],
  previous: string | null,
): string | null => {
  const live = toLiveMic(mics);
  if (live !== null) return toPictureCameraNumber(live.id) === null ? null : live.id;
  const number = previous === null ? null : toPictureCameraNumber(previous);
  return cameras.some((camera) => camera.number === number && !camera.isMuted) ? previous : null;
};

// Le micro du live est celui d'une caméra dont le téléphone ne filme pas vers OBS (`receiving` : les numéros des caméras qui le font) :
// rend l'identifiant de ce micro. Le PC, ou aucun micro de caméra au live, rend `null`.
export const toLostMicId = (liveCameraId: string | null, receiving: readonly number[]): string | null => {
  const number = liveCameraId === null ? null : toPictureCameraNumber(liveCameraId);
  return number !== null && !receiving.includes(number) ? liveCameraId : null;
};

// Le micro qui suit l'image : celui de la caméra choisie, sinon celui du PC.
export const toPictureMicId = (id: string): string => (toPictureCameraNumber(id) === null ? PC_MIC_ID : id);

// Le membre à l'image est-il une caméra qui ne filme plus ? Rend son identifiant, sinon `null`.
export const toLostPictureId = ({ members, currentId }: PictureState): string | null =>
  members.find(({ id, isAvailable }) => id === currentId && !isAvailable)?.id ?? null;
