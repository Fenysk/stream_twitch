// Ce que l'onglet envoie au serveur, et ce qu'il montre de ses refus : des fonctions pures, sans écran ni réseau.

import type { EditableSettings, LocalSettings, SettingsIssue } from "../../domain/settings.schema";
import { SLIDER_KEYS, SLIDERS, type SliderKey } from "./head-fields";

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
const LABELS = new Map<string, string>(SLIDERS.map(({ key, label }): [string, string] => [key, label]));

const toReadable = (message: string): string =>
  message.replace(/\b[A-Za-z]+\b/g, (word) => {
    const label = LABELS.get(word);
    return label ? `« ${label} »` : word;
  });

export type FieldErrors = { byKey: Partial<Record<string, string>>; general: string[] };

// Un refus qui nomme un curseur s'écrit sous lui ; une règle entre plusieurs réglages, ou une panne, s'écrit en haut.
export const toFieldErrors = (issues: readonly SettingsIssue[]): FieldErrors => {
  const known = new Set<string>(SLIDER_KEYS);
  const errors: FieldErrors = { byKey: {}, general: [] };
  for (const { path, message } of issues) {
    if (known.has(path)) errors.byKey[path] ??= toReadable(message);
    else errors.general.push(toReadable(path ? `${path} : ${message}` : message));
  }
  return errors;
};
