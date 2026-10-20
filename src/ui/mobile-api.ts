// Le mobile côté page : les flux du serveur (téléphone, page OBS d'une caméra, onglet « Mobile ») et ce que le téléphone lui demande.
// Chaque demande rend une réponse ou le refus à montrer, jamais une exception. Les refus du serveur sont déjà en français.

import type { z } from "zod";
import {
  type LinkRequest,
  type MobileState,
  MobileStateSchema,
  NumberAnswerSchema,
  PHONE_KEEPALIVE_EVENT,
  PHONE_STALE_MS,
  type PhoneEvent,
  PhoneEventSchema,
  type ScreenEvent,
  ScreenEventSchema,
  type ScreenKind,
  type Signal,
  type SignalRequest,
} from "../domain/phone.schema";
import { type Answer, ask } from "./expressions-api";
import { createFreshness } from "./stream-freshness";

const RECONNECT_MS = 1000;
const JSON_HEADERS = { "content-type": "application/json" };

const toJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch (error) {
    console.error("Mobile : message du serveur illisible", error);
    return undefined;
  }
};

// Un flux SSE que la page rouvre elle-même quand il se ferme : EventSource ne le fait pas pour une réponse d'erreur (le proxy de
// Tailscale répond 502 pendant que le serveur redémarre). L'adresse se relit à chaque ouverture, et `onOpen` prévient de chacune : le
// serveur redit alors tout ce qu'il sait. `onStale` (pour un flux qui bat) dit quand le flux devient périmé (une erreur, ou 15 s sans
// message ni battement `keepalive`) et quand il redevient vivant ; une connexion muette est alors rouverte, elle est peut-être morte sans
// erreur. Rend de quoi fermer le flux.
const watchStream = <Payload>(
  getUrl: () => string,
  schema: z.ZodType<Payload>,
  onEvent: (event: Payload) => void,
  onOpen?: () => void,
  onStale?: (isStale: boolean) => void,
): (() => void) => {
  let source: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reopen = () => {
    source?.close();
    clearTimeout(timer);
    timer = setTimeout(open, RECONNECT_MS);
  };
  const freshness =
    onStale && createFreshness({ staleMs: PHONE_STALE_MS, onChange: onStale, onSilence: reopen });
  const open = () => {
    const stream = new EventSource(getUrl());
    source = stream;
    freshness?.watch();
    stream.onopen = () => onOpen?.();
    if (freshness) stream.addEventListener(PHONE_KEEPALIVE_EVENT, freshness.hear);
    stream.onmessage = (message: MessageEvent<string>) => {
      freshness?.hear();
      const parsed = schema.safeParse(toJson(message.data));
      if (parsed.success) onEvent(parsed.data);
      else console.error("Mobile : message du serveur inattendu", parsed.error.message);
    };
    stream.onerror = () => {
      freshness?.lose();
      reopen();
    };
  };
  open();
  return () => {
    clearTimeout(timer);
    source?.close();
    freshness?.close();
  };
};

type PhoneWatch = {
  id: string;
  // Le numéro de caméra que le téléphone a gardé, relu à chaque ouverture du flux.
  getNumber: () => number | null;
  onEvent: (event: PhoneEvent) => void;
  // Le flux vient de s'ouvrir, ou de se rouvrir : le serveur ne sait plus rien de ce que ce téléphone croyait.
  onOpen: () => void;
  // Le flux devient périmé (erreur, ou rien reçu depuis 15 s) ou redevient vivant : ce que la page montre n'est plus à jour.
  onStale: (isStale: boolean) => void;
};

// Le flux d'un téléphone, ouvert une fois qu'il filme ou non : l'état de la régie et un battement qui dit qu'il est vivant, puis, quand il
// filme, son numéro, la page OBS de ce numéro pour chaque sorte (image, mic) et les signaux de ces pages.
export const watchPhone = ({ id, getNumber, onEvent, onOpen, onStale }: PhoneWatch): (() => void) =>
  watchStream(
    () => {
      const number = getNumber();
      const query = new URLSearchParams({ id, ...(number === null ? {} : { number: String(number) }) });
      return `/api/mobile/phone?${query}`;
    },
    PhoneEventSchema,
    onEvent,
    onOpen,
    onStale,
  );

// Le flux d'une page OBS d'une caméra, image ou mic : si son téléphone est là, et ses signaux.
export const watchScreen = (
  id: string,
  number: number,
  kind: ScreenKind,
  onEvent: (event: ScreenEvent) => void,
): (() => void) =>
  watchStream(
    () => `/api/mobile/screen?${new URLSearchParams({ id, number: String(number), kind })}`,
    ScreenEventSchema,
    onEvent,
  );

// Les téléphones connectés et l'origine des QR codes, pour l'onglet « Mobile ».
export const watchMobileState = (onState: (state: MobileState) => void): (() => void) =>
  watchStream(() => "/api/mobile/state", MobileStateSchema, onState);

// Le téléphone dit à quelle sorte de page il parle (une liaison par sorte) ; une page OBS n'en dit pas, son identifiant la désigne.
export type SignalSource =
  | { from: "phone"; phoneId: string; screenKind: ScreenKind }
  | { from: "screen"; screenId: string };

// Les signaux d'un côté partent un par un, dans l'ordre où ils sont donnés : l'autre côté veut l'offre avant ses candidats.
export const createSignalSender = (source: SignalSource): ((signal: Signal) => void) => {
  let chain: Promise<void> = Promise.resolve();
  return (signal) => {
    const request: SignalRequest = { ...source, signal };
    chain = chain.then(async () => {
      const answer = await ask(
        "/api/mobile/signal",
        { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(request) },
        () => true,
      );
      if (!answer.ok) console.warn("Mobile : signal non transmis", answer.message);
    });
  };
};

// Où en est la liaison d'un côté, dite au serveur. Les messages d'un côté partent un par un, dans l'ordre où ils sont donnés (« vive » puis
// « perdue » ne se croisent pas). Un refus (le serveur a redémarré : le flux se rouvre, et le côté redit où il en est) n'est que journalisé.
const createLinkSender = (): ((request: LinkRequest) => void) => {
  let chain: Promise<void> = Promise.resolve();
  return (request) => {
    chain = chain.then(async () => {
      const answer = await ask(
        "/api/mobile/link",
        { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(request) },
        () => true,
      );
      if (!answer.ok) console.warn("Mobile : liaison non transmise", answer.message);
    });
  };
};

// La page OBS d'une caméra dit si sa liaison avec le téléphone est vive.
export const createLinkReporter = (screenId: string): ((isLinked: boolean) => void) => {
  const send = createLinkSender();
  return (isLinked) => send({ from: "screen", screenId, isLinked });
};

// Le téléphone dit s'il est une caméra (Filmer est appuyé) et si sa caméra envoie une image : sans rouvrir son flux.
export type FilmReport = { isCamera: boolean; isFilming: boolean };

export const createFilmReporter = (phoneId: string): ((report: FilmReport) => void) => {
  const send = createLinkSender();
  return (report) => send({ from: "phone", phoneId, ...report });
};

// Le téléphone prend un autre numéro de caméra : le numéro gardé, ou le refus (déjà pris par un autre téléphone).
export const updatePhoneNumber = (phoneId: string, number: number): Promise<Answer<number>> =>
  ask(
    "/api/mobile/number",
    { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ phoneId, number }) },
    (body) => {
      const parsed = NumberAnswerSchema.safeParse(body);
      return parsed.success ? parsed.data.number : undefined;
    },
  );
