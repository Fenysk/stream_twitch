import { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import "../../../src/ui/design/design-system.css";
import "./inspector.css";
import type { CatalogueState } from "./catalogue-state";
import { Inspector } from "./inspector";
import { openSession, type Session } from "./session";

// Ce que le panneau montre : la touche choisie dans l'appli, ses réglages et ce que le plugin a lu du serveur.
type View = { session: Session; settings: Record<string, unknown>; catalogue: CatalogueState };

let view: View | undefined;
const listeners = new Set<() => void>();

const publish = (next: View | undefined): void => {
  view = next;
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const App = () => {
  const current = useSyncExternalStore(subscribe, () => view);
  if (!current) return null;
  const { session, settings, catalogue } = current;
  return (
    <Inspector
      action={session.action}
      settings={settings}
      catalogue={catalogue}
      onChange={(next) => {
        session.saveSettings(next);
        // Stream Deck ne renvoie pas au panneau ce qu'il enregistre : on le montre tout de suite.
        publish({ ...current, settings: { ...next } });
      }}
      onRetry={() => {
        publish({ ...current, catalogue: { status: "loading" } });
        session.requestCatalogue();
      }}
    />
  );
};

const container = document.getElementById("root");
if (container) createRoot(container).render(<App />);

// Stream Deck appelle cette fonction à l'ouverture du panneau, puis à chaque autre touche choisie.
window.connectElgatoStreamDeckSocket = (port, uuid, registerEvent, _info, actionInfo) => {
  view?.session.close();
  const session = openSession(
    { port, uuid, registerEvent, actionInfo },
    {
      onSettings: (settings) => {
        const current = view;
        if (current && current.session === session) publish({ ...current, settings });
      },
      onCatalogue: (catalogue) => {
        const current = view;
        if (current && current.session === session) publish({ ...current, catalogue });
      },
    },
  );
  publish(session && { session, settings: session.settings, catalogue: { status: "loading" } });
};
