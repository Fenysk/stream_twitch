// Les mots des alertes de /mobile : un texte court par alerte, et le libellé de son bouton quand elle en a un.

import type { AlertKind } from "../../domain/alert.rules";
import { toDurationText } from "../../domain/control.rules";

// Ce dont certains textes ont besoin : depuis combien de temps le micro est coupé (ms), et le micro entendu (« PC », « Caméra 2 »).
export type AlertContext = { mutedMs: number; awayLabel: string };

const toAwayText = (label: string): string =>
  label === "PC" ? "Le micro est au PC" : `Le micro est sur ${label}`;

const ALERT_WORDS: Record<AlertKind, { text: (context: AlertContext) => string; action: string | null }> = {
  lost: { text: () => "Connexion perdue · reconnexion…", action: null },
  stopped: { text: () => "Le live s'est arrêté", action: "OK" },
  unlinked: { text: () => "OBS non joint", action: null },
  muted: { text: ({ mutedMs }) => `Muet depuis ${toDurationText(mutedMs)}`, action: "Rallumer" },
  "camera-stopped": { text: () => "Ta caméra s'est arrêtée", action: "Relancer" },
  "camera-ready": { text: () => "Ta caméra est prête", action: "Montrer" },
  "mic-away": { text: ({ awayLabel }) => toAwayText(awayLabel), action: "Prendre" },
};

export const toAlertText = (kind: AlertKind, context: AlertContext): string =>
  ALERT_WORDS[kind].text(context);

export const toAlertActionLabel = (kind: AlertKind): string | null => ALERT_WORDS[kind].action;
