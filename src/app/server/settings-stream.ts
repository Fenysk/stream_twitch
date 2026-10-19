import { toSettingsView } from "../../domain/settings.rules";
import type { SettingsView } from "../../domain/settings.schema";
import type { SettingsStore } from "../../usecase/settings.usecase";

// Le nom de l'évènement qui garde le flux ouvert : sans rien à dire pendant 5 minutes, le `fetch` de Node 20 (le plugin Stream Deck) le
// croit mort et le coupe. Il ne porte rien : le plugin ne lit que les messages sans nom.
export const SETTINGS_KEEPALIVE_EVENT = "keepalive";
export const SETTINGS_KEEPALIVE_MS = 30_000;

// Ce qu'une connexion au flux des réglages reçoit : la vue des réglages (celle de `GET /api/settings`) à la connexion puis à chaque
// changement, d'où qu'il vienne, en messages sans nom ; et un message `keepalive` régulier. Rend de quoi tout fermer.
export function openSettingsStream(
  { settings }: { settings: Pick<SettingsStore, "getState" | "subscribe"> },
  send: (view: SettingsView) => void,
  sendNamed: (event: string, payload: null) => void,
): () => void {
  send(toSettingsView(settings.getState()));
  const unsubscribe = settings.subscribe((state) => send(toSettingsView(state)));
  const keepalive = setInterval(() => sendNamed(SETTINGS_KEEPALIVE_EVENT, null), SETTINGS_KEEPALIVE_MS);
  return () => {
    clearInterval(keepalive);
    unsubscribe();
  };
}
