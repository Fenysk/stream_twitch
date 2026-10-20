import { toNextNumber } from "../domain/camera.rules";
import {
  type LinkRequest,
  type PhoneEvent,
  type PhoneSummary,
  SCREEN_KINDS,
  type ScreenEvent,
  type ScreenKind,
  type Signal,
  type SignalRequest,
} from "../domain/phone.schema";

export type PhoneOpening = { id: string; number?: number | undefined };
export type ScreenOpening = { id: string; number: number; kind: ScreenKind };

export type NumberResult = { ok: true; number: number } | { ok: false; status: 404 | 409; message: string };

export type LinkResult = { ok: true } | { ok: false; status: 404; message: string };

// `isDelivered` : l'autre côté était là pour recevoir le signal. Sinon il est perdu, et celui qui l'a envoyé le renvoie quand l'autre
// côté arrive (le serveur le lui dit).
export type RelayResult = { ok: true; isDelivered: boolean } | { ok: false; status: 404; message: string };

export type PhonesDeps = { log: (message: string) => void };

export type Phones = {
  // Un téléphone ouvre son flux, sans numéro : il n'en prend un qu'en filmant (`updateLink`). `number` : celui qu'il avait gardé, qu'il
  // reprend à son premier Filmer s'il est libre. Rend de quoi fermer le flux. Le même identifiant remplace son ancienne connexion, et une
  // caméra qui se reconnecte garde son numéro.
  openPhone(opening: PhoneOpening, send: (event: PhoneEvent) => void): () => void;
  // Une page OBS ouvre son flux : elle apprend si son téléphone est là. La dernière page ouverte d'un numéro, pour sa sorte (image ou mic),
  // est la page active de cette sorte.
  openScreen(opening: ScreenOpening, send: (event: ScreenEvent) => void): () => void;
  // Le téléphone prend un autre numéro de caméra, s'il est libre.
  updateNumber(phoneId: string, number: number): NumberResult;
  // Un signal passe du téléphone à la page active de son numéro pour la sorte qu'il vise, ou de la page active à son téléphone.
  relay(request: SignalRequest): RelayResult;
  // Un côté dit où en est la liaison : le téléphone s'il est une caméra (Filmer) et s'il envoie une image, la page OBS si sa liaison est vive.
  // Filmer donne un numéro au téléphone, l'arrêter le rend, sans rouvrir le flux. Le tableau des téléphones le redit.
  updateLink(request: LinkRequest): LinkResult;
  getState(): PhoneSummary[];
  // Le tableau des téléphones connectés, à chaque changement.
  subscribe(listener: (phones: PhoneSummary[]) => void): () => void;
};

// `shownScreens` (la page active de chaque sorte) et `isPhoneShown` : ce que le serveur a déjà dit à ce côté (rien : jamais), pour ne pas le
// répéter. `isCamera` : Filmer est appuyé, le téléphone a un numéro (faux à l'ouverture, sauf pour une caméra qui se reconnecte). `wanted` :
// le numéro qu'il voudrait au prochain Filmer (celui gardé, puis le dernier tenu). `isFilming` : sa caméra envoie une image (faux à
// l'ouverture : le téléphone le dit). `isLinked` : la liaison de la page OBS avec son téléphone est vive (faux à l'ouverture : la page le
// dit quand la mise en relation est faite).
type PhoneEntry = {
  id: string;
  number: number | null;
  wanted: number | undefined;
  send: (event: PhoneEvent) => void;
  shownScreens: Partial<Record<ScreenKind, string | null>>;
  isCamera: boolean;
  isFilming: boolean;
};

type ScreenEntry = {
  id: string;
  number: number;
  kind: ScreenKind;
  send: (event: ScreenEvent) => void;
  isPhoneShown: boolean | undefined;
  isLinked: boolean;
};

// Qui est connecté : les téléphones par identifiant, les pages OBS dans l'ordre où elles se sont ouvertes.
type Roster = { phones: Map<string, PhoneEntry>; screens: ScreenEntry[] };

const NOT_FOUND_PHONE = "téléphone inconnu : rouvre /mobile";
const NOT_FOUND_SCREEN = "page de caméra inconnue : recharge la source";

// Comment le journal nomme la page d'une caméra, selon sa sorte.
const SCREEN_NAMES: Record<ScreenKind, string> = { image: "Page OBS", mic: "Page mic" };

// Par numéro, puis par identifiant ; les téléphones sans numéro à la fin. `NaN` (deux sans numéro) laisse l'identifiant décider.
const byNumber = (a: PhoneSummary, b: PhoneSummary): number =>
  (a.number ?? Number.POSITIVE_INFINITY) - (b.number ?? Number.POSITIVE_INFINITY) || a.id.localeCompare(b.id);

// La page active d'un numéro pour une sorte : la dernière ouverte.
const getActiveScreen = ({ screens }: Roster, number: number, kind: ScreenKind): ScreenEntry | undefined =>
  screens.findLast((screen) => screen.number === number && screen.kind === kind);

const getPhoneOf = ({ phones }: Roster, number: number): PhoneEntry | undefined =>
  [...phones.values()].find((phone) => phone.number === number);

const hasScreenOf = (roster: Roster, phone: PhoneEntry, kind: ScreenKind): boolean =>
  phone.number !== null && getActiveScreen(roster, phone.number, kind) !== undefined;

// Ce qu'un téléphone envoie à une sorte de page arrive dans OBS : sa page active a une liaison vive et le téléphone filme.
const isArriving = (roster: Roster, phone: PhoneEntry, kind: ScreenKind): boolean =>
  phone.number !== null && phone.isFilming && getActiveScreen(roster, phone.number, kind)?.isLinked === true;

const toSummaries = (roster: Roster): PhoneSummary[] =>
  [...roster.phones.values()]
    .map((phone) => ({
      id: phone.id,
      number: phone.number,
      hasScreen: hasScreenOf(roster, phone, "image"),
      hasMicScreen: hasScreenOf(roster, phone, "mic"),
      isReceiving: isArriving(roster, phone, "image"),
      isHeard: isArriving(roster, phone, "mic"),
    }))
    .sort(byNumber);

// Dit au téléphone et aux pages d'un numéro ce qui a changé pour eux, sans répéter ce qu'ils savent déjà : la page active de chaque sorte
// sait si son téléphone est là, les autres pages ne l'ont pas, le téléphone sait quelle est la page active de chaque sorte.
const notify = (roster: Roster, number: number | null): void => {
  if (number === null) return;
  const phone = getPhoneOf(roster, number);
  for (const screen of roster.screens) {
    if (screen.number !== number) continue;
    const isPresent = screen === getActiveScreen(roster, number, screen.kind) && phone !== undefined;
    if (screen.isPhoneShown === isPresent) continue;
    screen.isPhoneShown = isPresent;
    screen.send({ kind: "phone", isPresent });
  }
  if (!phone) return;
  for (const screenKind of SCREEN_KINDS) {
    const screenId = getActiveScreen(roster, number, screenKind)?.id ?? null;
    if (phone.shownScreens[screenKind] === screenId) continue;
    phone.shownScreens[screenKind] = screenId;
    phone.send({ kind: "screen", screenKind, screenId });
  }
};

// Le numéro voulu s'il est libre, sinon le plus petit libre. Le téléphone qui revient ne prend pas son propre numéro pour un conflit.
const assignNumber = (roster: Roster, id: string, wanted: number | undefined): number => {
  const taken = [...roster.phones.values()].flatMap((phone) =>
    phone.id !== id && phone.number !== null ? [phone.number] : [],
  );
  return wanted !== undefined && !taken.includes(wanted) ? wanted : toNextNumber(taken);
};

const toPhoneName = ({ id }: PhoneEntry): string => `Téléphone ${id.slice(0, 4)}`;

const relayFromPhone = (
  roster: Roster,
  phoneId: string,
  screenKind: ScreenKind,
  signal: Signal,
): RelayResult => {
  const phone = roster.phones.get(phoneId);
  if (!phone) return { ok: false, status: 404, message: NOT_FOUND_PHONE };
  const screen = phone.number === null ? undefined : getActiveScreen(roster, phone.number, screenKind);
  screen?.send({ kind: "signal", signal });
  return { ok: true, isDelivered: screen !== undefined };
};

const relayFromScreen = (roster: Roster, screenId: string, signal: Signal): RelayResult => {
  const screen = roster.screens.find(({ id }) => id === screenId);
  if (!screen) return { ok: false, status: 404, message: NOT_FOUND_SCREEN };
  const phone =
    getActiveScreen(roster, screen.number, screen.kind) === screen
      ? getPhoneOf(roster, screen.number)
      : undefined;
  phone?.send({ kind: "signal", screenKind: screen.kind, signal });
  return { ok: true, isDelivered: phone !== undefined };
};

// Filmer : le téléphone prend un numéro (celui voulu s'il est libre, sinon le plus petit libre), le dit et apprend la page OBS de ce numéro.
const startCamera = (roster: Roster, phone: PhoneEntry): number => {
  const number = assignNumber(roster, phone.id, phone.wanted);
  phone.isCamera = true;
  phone.number = number;
  phone.wanted = number;
  phone.shownScreens = {};
  phone.send({ kind: "number", number });
  notify(roster, number);
  return number;
};

// Arrêter de filmer : le téléphone rend son numéro (il le voudra au prochain Filmer), le sait, et la page OBS apprend qu'il est parti.
const stopCamera = (roster: Roster, phone: PhoneEntry): number | null => {
  const previous = phone.number;
  phone.isCamera = false;
  phone.number = null;
  phone.shownScreens = {};
  phone.send({ kind: "number", number: null });
  notify(roster, previous);
  return previous;
};

// Le téléphone dit s'il est une caméra et s'il envoie une image : rend si cela change quelque chose, `null` quand il est inconnu. Une image
// ne s'envoie que d'une caméra : `isFilming` sans `isCamera` vaut faux.
const updateFilming = (
  roster: Roster,
  { phoneId, isCamera, isFilming }: Extract<LinkRequest, { from: "phone" }>,
  log: (message: string) => void,
): boolean | null => {
  const phone = roster.phones.get(phoneId);
  if (!phone) return null;
  const isSending = isCamera && isFilming;
  const isChanged = phone.isCamera !== isCamera || phone.isFilming !== isSending;
  if (isCamera && !phone.isCamera) log(`${toPhoneName(phone)} filme : caméra ${startCamera(roster, phone)}.`);
  if (!isCamera && phone.isCamera) {
    log(`${toPhoneName(phone)} ne filme plus (caméra ${stopCamera(roster, phone)} rendue).`);
  }
  phone.isFilming = isSending;
  return isChanged;
};

const updateLinked = (roster: Roster, screenId: string, isLinked: boolean): boolean | null => {
  const screen = roster.screens.find(({ id }) => id === screenId);
  if (!screen) return null;
  const isChanged = screen.isLinked !== isLinked;
  screen.isLinked = isLinked;
  return isChanged;
};

export function createPhones({ log }: PhonesDeps): Phones {
  const roster: Roster = { phones: new Map(), screens: [] };
  const listeners = new Set<(phones: PhoneSummary[]) => void>();

  const publish = () => {
    const state = toSummaries(roster);
    for (const listener of listeners) listener(state);
  };

  return {
    openPhone({ id, number: wanted }, send) {
      const previous = roster.phones.get(id);
      const isCamera = previous?.isCamera ?? false;
      const entry: PhoneEntry = {
        id,
        number: null,
        wanted: previous?.number ?? wanted,
        send,
        shownScreens: {},
        isCamera,
        isFilming: false,
      };
      roster.phones.set(id, entry);
      // Une caméra qui se reconnecte garde son numéro sans trou : un autre téléphone n'y prend pas sa place.
      if (isCamera) {
        entry.number = assignNumber(roster, id, entry.wanted);
        entry.wanted = entry.number;
        send({ kind: "number", number: entry.number });
      }
      notify(roster, entry.number);
      if (previous && previous.number !== entry.number) notify(roster, previous.number);
      publish();
      log(`${toPhoneName(entry)} connecté${entry.number === null ? "" : ` : caméra ${entry.number}`}.`);
      return () => {
        if (roster.phones.get(id) !== entry) return;
        roster.phones.delete(id);
        notify(roster, entry.number);
        publish();
        log(`${toPhoneName(entry)} déconnecté.`);
      };
    },
    openScreen({ id, number, kind }, send) {
      const entry: ScreenEntry = { id, number, kind, send, isPhoneShown: undefined, isLinked: false };
      roster.screens = [...roster.screens.filter((screen) => screen.id !== id), entry];
      notify(roster, number);
      publish();
      log(`${SCREEN_NAMES[kind]} de la caméra ${number} connectée.`);
      return () => {
        if (!roster.screens.includes(entry)) return;
        roster.screens = roster.screens.filter((screen) => screen !== entry);
        notify(roster, number);
        publish();
        log(`${SCREEN_NAMES[kind]} de la caméra ${number} déconnectée.`);
      };
    },
    updateNumber(phoneId, number) {
      const phone = roster.phones.get(phoneId);
      if (!phone) return { ok: false, status: 404, message: NOT_FOUND_PHONE };
      const previous = phone.number;
      if (previous === null) return { ok: false, status: 409, message: "ce téléphone ne filme pas" };
      if (previous === number) return { ok: true, number };
      if (getPhoneOf(roster, number)) {
        return {
          ok: false,
          status: 409,
          message: `la caméra ${number} est déjà prise par un autre téléphone`,
        };
      }
      phone.number = number;
      phone.wanted = number;
      phone.shownScreens = {};
      phone.send({ kind: "number", number });
      notify(roster, previous);
      notify(roster, number);
      publish();
      log(`${toPhoneName(phone)} : la caméra ${previous} devient la caméra ${number}.`);
      return { ok: true, number };
    },
    relay: (request) =>
      request.from === "phone"
        ? relayFromPhone(roster, request.phoneId, request.screenKind, request.signal)
        : relayFromScreen(roster, request.screenId, request.signal),
    updateLink(request) {
      const isChanged =
        request.from === "phone"
          ? updateFilming(roster, request, log)
          : updateLinked(roster, request.screenId, request.isLinked);
      if (isChanged === null) {
        return {
          ok: false,
          status: 404,
          message: request.from === "phone" ? NOT_FOUND_PHONE : NOT_FOUND_SCREEN,
        };
      }
      if (isChanged) publish();
      return { ok: true };
    },
    getState: () => toSummaries(roster),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
