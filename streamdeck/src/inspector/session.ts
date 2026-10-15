import { z } from "zod";
import { type CatalogueAnswer, CatalogueAnswerSchema } from "../../../src/domain/deck.schema";

// Ce que Stream Deck donne à `connectElgatoStreamDeckSocket` pour ouvrir la connexion.
export type Registration = { port: string; uuid: string; registerEvent: string; actionInfo: string };

// L'action pour laquelle le panneau s'ouvre, et les réglages que sa touche garde.
const ActionInfoSchema = z.object({
  action: z.string(),
  payload: z.object({ settings: z.record(z.string(), z.unknown()) }),
});

// Ce que Stream Deck envoie au panneau : on ne lit que ces deux évènements.
const IncomingSchema = z.object({ event: z.string(), payload: z.unknown() });
const SettingsPayloadSchema = z.object({ settings: z.record(z.string(), z.unknown()) });

// Ce que la session demande à une connexion : le WebSocket du navigateur, ou un faux dans les tests.
export type SocketLike = {
  send: (text: string) => void;
  close: () => void;
  onOpen: (listener: () => void) => void;
  onMessage: (listener: (text: string) => void) => void;
};

const openWebSocket = (url: string): SocketLike => {
  const socket = new WebSocket(url);
  return {
    send: (text) => socket.send(text),
    close: () => socket.close(),
    onOpen: (listener) => socket.addEventListener("open", () => listener()),
    onMessage: (listener) => socket.addEventListener("message", (event) => listener(String(event.data))),
  };
};

export type SessionHandlers = {
  onSettings: (settings: Record<string, unknown>) => void;
  onCatalogue: (answer: CatalogueAnswer) => void;
};

export type Session = {
  // L'identifiant de l'action du manifest et les réglages de la touche à l'ouverture.
  action: string;
  settings: Record<string, unknown>;
  // Garder les réglages de la touche ; le plugin les reçoit (onDidReceiveSettings).
  saveSettings: (settings: object) => void;
  // Demander le catalogue au plugin : le panneau ne parle jamais au serveur.
  requestCatalogue: () => void;
  close: () => void;
};

export const openSession = (
  registration: Registration,
  handlers: SessionHandlers,
  createSocket: (url: string) => SocketLike = openWebSocket,
): Session | undefined => {
  const { port, uuid, registerEvent, actionInfo } = registration;
  let json: unknown;
  try {
    json = JSON.parse(actionInfo);
  } catch (error) {
    console.error("Inspecteur : les informations de la touche sont illisibles.", error);
    return undefined;
  }
  const info = ActionInfoSchema.safeParse(json);
  if (!info.success) {
    console.error("Inspecteur : les informations de la touche ne sont pas celles attendues.", info.error);
    return undefined;
  }
  const { action } = info.data;
  const socket = createSocket(`ws://127.0.0.1:${port}`);
  const send = (message: object): void => socket.send(JSON.stringify(message));
  const requestCatalogue = (): void =>
    send({ action, context: uuid, event: "sendToPlugin", payload: { type: "catalogue" } });

  socket.onOpen(() => {
    send({ event: registerEvent, uuid });
    requestCatalogue();
  });
  socket.onMessage((text) => {
    const incoming = IncomingSchema.safeParse(parseJson(text));
    if (!incoming.success) return;
    if (incoming.data.event === "didReceiveSettings") {
      const received = SettingsPayloadSchema.safeParse(incoming.data.payload);
      if (received.success) handlers.onSettings(received.data.settings);
    } else if (incoming.data.event === "sendToPropertyInspector") {
      const answer = CatalogueAnswerSchema.safeParse(incoming.data.payload);
      if (answer.success) handlers.onCatalogue(answer.data);
    }
  });

  return {
    action,
    settings: info.data.payload.settings,
    saveSettings: (settings) => send({ action, context: uuid, event: "setSettings", payload: settings }),
    requestCatalogue,
    close: () => socket.close(),
  };
};

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch (error) {
    console.warn("Inspecteur : un message de Stream Deck n'est pas du JSON.", error);
    return undefined;
  }
};
