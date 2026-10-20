import type { ObsIdRecord, ObsNameKey } from "./obs-ids.schema";
import type { Settings } from "./settings.schema";

export type ObsKind = "input" | "scene";

// Une entrée ou une scène d'OBS : son identifiant, qui ne change pas quand elle est renommée, et son nom à cet instant.
export type ObsIdentity = { uuid: string; name: string };

// OBS vient de renommer une entrée (InputNameChanged) ou une scène (SceneNameChanged).
export type ObsRenamed = { kind: ObsKind; uuid: string; from: string; to: string };

// Le nom d'OBS à utiliser pour chaque réglage qui en a un.
export type ObsNames = Partial<Record<ObsNameKey, string>>;

// Ce que la lecture d'OBS a appris d'un réglage : sa source vient d'être retenue, a changé de nom depuis la dernière lecture, ou a disparu.
export type ObsResolutionEvent =
  | { kind: "tracked" }
  | { kind: "renamed"; from: string }
  | { kind: "lost"; from: string };

export type ObsResolution = {
  // Le nom d'OBS à utiliser.
  name: string;
  // Ce qui reste retenu pour ce réglage ; rien quand aucune source ne porte son nom.
  record: ObsIdRecord | undefined;
  event: ObsResolutionEvent | undefined;
};

// Le genre de ce que chaque réglage nomme, et comment le journal l'appelle.
const DESCRIPTORS: Record<ObsNameKey, { kind: ObsKind; label: string }> = {
  micName: { kind: "input", label: "Entrée du micro" },
  desktopName: { kind: "input", label: "Entrée du son du PC" },
  cameraSlotScene: { kind: "scene", label: "Scène de la place caméra" },
  showEndScene: { kind: "scene", label: "Scène de fin de l'émission" },
};

export const toObsKind = (key: ObsNameKey): ObsKind => DESCRIPTORS[key].kind;

export const toObsLabel = (key: ObsNameKey): string => DESCRIPTORS[key].label;

// Un réglage vide ne nomme rien.
export const toConfiguredName = (value: string | undefined): string | undefined =>
  value === undefined || value === "" ? undefined : value;

// La source retenue ne vaut que pour le nom que le réglage portait quand elle l'a été : un nom changé à la main l'écarte.
const toTracked = (configured: string, record: ObsIdRecord | undefined): ObsIdRecord | undefined =>
  record?.configuredName === configured ? record : undefined;

// Le nom à utiliser avant qu'OBS réponde : le dernier que la source retenue portait, sinon celui du réglage.
export const toStartName = (configured: string, record: ObsIdRecord | undefined): string =>
  toTracked(configured, record)?.name ?? configured;

// Ce que la lecture d'OBS (`listed`, toutes ses entrées ou toutes ses scènes) change pour ce réglage : la source retenue est
// retrouvée par son identifiant, sous le nom qu'OBS lui donne ; disparue, ou jamais retenue, c'est le nom du réglage qui la cherche.
export function toResolution(
  configured: string,
  kept: ObsIdRecord | undefined,
  listed: readonly ObsIdentity[],
): ObsResolution {
  const tracked = toTracked(configured, kept);
  const followed = tracked && listed.find(({ uuid }) => uuid === tracked.uuid);
  if (tracked && followed) {
    return {
      name: followed.name,
      record: { configuredName: configured, uuid: followed.uuid, name: followed.name },
      event: followed.name === tracked.name ? undefined : { kind: "renamed", from: tracked.name },
    };
  }
  const named = listed.find(({ name }) => name === configured);
  const record = named && { configuredName: configured, uuid: named.uuid, name: configured };
  if (tracked) return { name: configured, record, event: { kind: "lost", from: tracked.name } };
  return { name: configured, record, event: named ? { kind: "tracked" } : undefined };
}

// La source retenue de ce réglage porte le nom qu'OBS vient de lui donner ; rien quand le renommage en touche une autre.
export const toRenamedRecord = (
  key: ObsNameKey,
  kept: ObsIdRecord | undefined,
  configured: string | undefined,
  renamed: ObsRenamed,
): ObsIdRecord | undefined =>
  kept && toObsKind(key) === renamed.kind && kept.configuredName === configured && kept.uuid === renamed.uuid
    ? { ...kept, name: renamed.to }
    : undefined;

// Le réglage prend le nom qu'OBS donne déjà à la source retenue (la scène de fin choisie dans l'interface après un renommage) : la
// même source reste suivie. Tout autre nom l'écarte.
export const toAlignedRecord = (
  kept: ObsIdRecord | undefined,
  configured: string,
): ObsIdRecord | undefined =>
  kept?.name === configured ? { ...kept, configuredName: configured } : undefined;

// Les réglages avec, à la place des noms qu'ils portent, ceux qu'OBS donne maintenant à leurs sources et scènes.
export const toNamedSettings = (settings: Settings, names: ObsNames): Settings => ({ ...settings, ...names });

// La ligne du journal d'un réglage : `name` est le nom d'OBS à utiliser après l'évènement.
export function toObsLine(key: ObsNameKey, event: ObsResolutionEvent, name: string): string {
  const label = toObsLabel(key);
  if (event.kind === "renamed")
    return `${label} renommée dans OBS : « ${event.from} » → « ${name} », suivie.`;
  if (event.kind === "lost")
    return `${label} « ${event.from} » supprimée dans OBS : retour au nom des réglages, « ${name} ».`;
  return `${label} « ${name} » retenue par son identifiant : si OBS la renomme, elle reste suivie.`;
}
