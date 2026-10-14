// Ce que l'onglet envoie au serveur, et ce qu'il montre de ses refus : des fonctions pures, sans écran ni réseau.

import type { EditableSettings, LocalSettings, SettingsIssue } from "../../domain/settings.schema";
import { CHAT_SLIDERS } from "./chat-fields";
import { FOX_LISTS, FOX_SLIDERS, FOX_TIMES } from "./fox-fields";
import { SLIDERS, type SliderKey } from "./head-fields";

// Les curseurs de tous les onglets : ceux de la tête, du tchat, puis du renard.
const ALL_SLIDERS = [...SLIDERS, ...CHAT_SLIDERS, ...FOX_SLIDERS];
const SLIDER_KEYS: readonly SliderKey[] = ALL_SLIDERS.map(({ key }) => key);

// Les valeurs choisies, pas encore (ou pas) appliquées. `null` : le réglage local est retiré.
export type Drafts = Partial<Record<SliderKey, number | null>>;
export type Changes = Partial<Record<SliderKey, number | null>>;

// Chaque brouillon qui diffère de ce qui s'applique : un refus laisse donc les brouillons, et le changement suivant les
// renvoie avec lui. `null` retire le réglage local ; sans réglage local, il n'y a rien à retirer.
export const toChanges = (drafts: Drafts, local: LocalSettings, effective: EditableSettings): Changes => {
  const changes: Changes = {};
  for (const key of SLIDER_KEYS) {
    const draft = drafts[key];
    if (draft === undefined) continue;
    if (draft === null) {
      if (local[key] !== undefined) changes[key] = null;
    } else if (draft !== effective[key]) changes[key] = draft;
  }
  return changes;
};

// L'onglet est aux valeurs par défaut : aucune de ses clés dans settings.local.json, et aucun brouillon à envoyer.
export const isDefaultTab = (
  keys: readonly string[],
  drafts: Drafts,
  local: LocalSettings,
  effective: EditableSettings,
): boolean =>
  keys.every((key) => !(key in local)) && Object.keys(toChanges(drafts, local, effective)).length === 0;

// Après un changement accepté : seuls restent les brouillons que le serveur n'a pas pris en compte (un geste arrivé pendant l'envoi).
export const toRemainingDrafts = (
  drafts: Drafts,
  local: LocalSettings,
  effective: EditableSettings,
): Drafts => {
  const remaining: Drafts = {};
  const changes = toChanges(drafts, local, effective);
  for (const key of SLIDER_KEYS) {
    const draft = drafts[key];
    if (draft !== undefined && key in changes) remaining[key] = draft;
  }
  return remaining;
};

// Le serveur parle de `threshold` ; l'interface montre « Seuil du micro » : un refus se lit avec les libellés des curseurs.
const LABELS = new Map<string, string>(
  [...ALL_SLIDERS, ...FOX_LISTS, ...FOX_TIMES].map(({ key, label }): [string, string] => [key, label]),
);

const toReadable = (message: string): string =>
  message.replace(/\b[A-Za-z]+\b/g, (word) => {
    const label = LABELS.get(word);
    return label ? `« ${label} »` : word;
  });

export type FieldErrors = { byKey: Partial<Record<string, string>>; general: string[] };

// Un refus qui nomme un curseur s'écrit sous lui ; une règle entre plusieurs réglages, ou une panne, s'écrit en haut.
export const toFieldErrors = (issues: readonly SettingsIssue[]): FieldErrors => {
  // Les réglages dont le refus s'écrit sous leur champ : les curseurs et les heures.
  const known = new Set<string>([...SLIDER_KEYS, ...FOX_TIMES.map(({ key }) => key)]);
  const lists = new Set<string>(FOX_LISTS.map(({ key }) => key));
  const errors: FieldErrors = { byKey: {}, general: [] };
  for (const { path, message } of issues) {
    // Un refus sur une ligne d'une liste (`foxJabs.3`) s'écrit sous la liste, avec le numéro de la ligne.
    const [listKey, index] = path.split(".");
    if (known.has(path)) errors.byKey[path] ??= toReadable(message);
    else if (listKey !== undefined && lists.has(listKey) && index !== undefined && /^\d+$/.test(index)) {
      errors.byKey[listKey] ??= `ligne ${Number(index) + 1} : ${toReadable(message)}`;
    } else if (lists.has(path)) errors.byKey[path] ??= toReadable(message);
    else errors.general.push(toReadable(path ? `${path} : ${message}` : message));
  }
  return errors;
};
