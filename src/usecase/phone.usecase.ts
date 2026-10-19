import { hasCamera, toNextNumber } from "../domain/camera.rules";
import type {
  LinkRequest,
  PhoneEvent,
  PhoneRole,
  PhoneSummary,
  ScreenEvent,
  Signal,
  SignalRequest,
} from "../domain/phone.schema";

export type PhoneOpening = { id: string; role: PhoneRole; number?: number | undefined };
export type ScreenOpening = { id: string; number: number };

export type NumberResult = { ok: true; number: number } | { ok: false; status: 404 | 409; message: string };

export type LinkResult = { ok: true } | { ok: false; status: 404; message: string };

// `isDelivered` : l'autre côté était là pour recevoir le signal. Sinon il est perdu, et celui qui l'a envoyé le renvoie quand l'autre
// côté arrive (le serveur le lui dit).
export type RelayResult = { ok: true; isDelivered: boolean } | { ok: false; status: 404; message: string };

export type PhonesDeps = { log: (message: string) => void };

export type Phones = {
  // Un téléphone ouvre son flux : il prend un numéro de caméra si son rôle en a une (celui qu'il avait gardé s'il est libre), et
  // apprend la page OBS de ce numéro. Rend de quoi fermer le flux. Le même identifiant remplace son ancienne connexion.
  openPhone(opening: PhoneOpening, send: (event: PhoneEvent) => void): () => void;
  // Une page OBS ouvre son flux : elle apprend si son téléphone est là. La dernière page ouverte d'un numéro est la page active.
  openScreen(opening: ScreenOpening, send: (event: ScreenEvent) => void): () => void;
  // Le téléphone prend un autre numéro de caméra, s'il est libre.
  updateNumber(phoneId: string, number: number): NumberResult;
  // Un signal passe du téléphone à la page active de son numéro, ou de la page active à son téléphone.
  relay(request: SignalRequest): RelayResult;
  // Un côté dit où en est la liaison : le téléphone s'il filme, la page OBS si sa liaison est vive. Le tableau des téléphones le redit.
  updateLink(request: LinkRequest): LinkResult;
  getState(): PhoneSummary[];
  // Le tableau des téléphones connectés, à chaque changement.
  subscribe(listener: (phones: PhoneSummary[]) => void): () => void;
};

// `shownScreen` et `isPhoneShown` : ce que le serveur a déjà dit à ce côté (rien : jamais), pour ne pas le répéter. `isFilming` : le
// téléphone filme (vrai à l'ouverture : seul un téléphone dont la caméra est arrêtée le dit). `isLinked` : la liaison de la page OBS avec
// son téléphone est vive (faux à l'ouverture : la page le dit quand la mise en relation est faite).
type PhoneEntry = {
  id: string;
  role: PhoneRole;
  number: number | null;
  send: (event: PhoneEvent) => void;
  shownScreen: string | null | undefined;
  isFilming: boolean;
};

type ScreenEntry = {
  id: string;
  number: number;
  send: (event: ScreenEvent) => void;
  isPhoneShown: boolean | undefined;
  isLinked: boolean;
};

// Qui est connecté : les téléphones par identifiant, les pages OBS dans l'ordre où elles se sont ouvertes.
type Roster = { phones: Map<string, PhoneEntry>; screens: ScreenEntry[] };

const NOT_FOUND_PHONE = "téléphone inconnu : rouvre /mobile";
const NOT_FOUND_SCREEN = "page de caméra inconnue : recharge la source";

// Par numéro, puis par identifiant ; les téléphones sans numéro à la fin. `NaN` (deux sans numéro) laisse l'identifiant décider.
const byNumber = (a: PhoneSummary, b: PhoneSummary): number =>
  (a.number ?? Number.POSITIVE_INFINITY) - (b.number ?? Number.POSITIVE_INFINITY) || a.id.localeCompare(b.id);

const getActiveScreen = ({ screens }: Roster, number: number): ScreenEntry | undefined =>
  screens.findLast((screen) => screen.number === number);

const getPhoneOf = ({ phones }: Roster, number: number): PhoneEntry | undefined =>
  [...phones.values()].find((phone) => phone.number === number);

// L'image d'un téléphone arrive dans OBS : sa page active a une liaison vive et le téléphone filme.
const isReceivingImage = (roster: Roster, phone: PhoneEntry): boolean =>
  phone.number !== null && phone.isFilming && getActiveScreen(roster, phone.number)?.isLinked === true;

const toSummaries = (roster: Roster): PhoneSummary[] =>
  [...roster.phones.values()]
    .map((phone) => ({
      id: phone.id,
      role: phone.role,
      number: phone.number,
      hasScreen: phone.number !== null && roster.screens.some((screen) => screen.number === phone.number),
      isReceiving: isReceivingImage(roster, phone),
    }))
    .sort(byNumber);

// Dit au téléphone et aux pages d'un numéro ce qui a changé pour eux, sans répéter ce qu'ils savent déjà : la page active sait si son
// téléphone est là, les autres pages ne l'ont pas, le téléphone sait quelle est la page active.
const notify = (roster: Roster, number: number | null): void => {
  if (number === null) return;
  const active = getActiveScreen(roster, number);
  const phone = getPhoneOf(roster, number);
  for (const screen of roster.screens) {
    if (screen.number !== number) continue;
    const isPresent = screen === active && phone !== undefined;
    if (screen.isPhoneShown === isPresent) continue;
    screen.isPhoneShown = isPresent;
    screen.send({ kind: "phone", isPresent });
  }
  const screenId = active?.id ?? null;
  if (phone && phone.shownScreen !== screenId) {
    phone.shownScreen = screenId;
    phone.send({ kind: "screen", screenId });
  }
};

// Le numéro gardé s'il est libre, sinon le plus petit libre ; aucun pour un rôle sans caméra. Le téléphone qui revient ne prend pas
// son propre numéro pour un conflit.
const assignNumber = (
  roster: Roster,
  id: string,
  role: PhoneRole,
  wanted: number | undefined,
): number | null => {
  if (!hasCamera(role)) return null;
  const taken = [...roster.phones.values()].flatMap((phone) =>
    phone.id !== id && phone.number !== null ? [phone.number] : [],
  );
  return wanted !== undefined && !taken.includes(wanted) ? wanted : toNextNumber(taken);
};

const toPhoneName = ({ id, role }: PhoneEntry): string => `Téléphone ${id.slice(0, 4)} (${role})`;

const relayFromPhone = (roster: Roster, phoneId: string, signal: Signal): RelayResult => {
  const phone = roster.phones.get(phoneId);
  if (!phone) return { ok: false, status: 404, message: NOT_FOUND_PHONE };
  const screen = phone.number === null ? undefined : getActiveScreen(roster, phone.number);
  screen?.send({ kind: "signal", signal });
  return { ok: true, isDelivered: screen !== undefined };
};

const relayFromScreen = (roster: Roster, screenId: string, signal: Signal): RelayResult => {
  const screen = roster.screens.find(({ id }) => id === screenId);
  if (!screen) return { ok: false, status: 404, message: NOT_FOUND_SCREEN };
  const phone =
    getActiveScreen(roster, screen.number) === screen ? getPhoneOf(roster, screen.number) : undefined;
  phone?.send({ kind: "signal", signal });
  return { ok: true, isDelivered: phone !== undefined };
};

// Le téléphone dit s'il filme, la page OBS dit si sa liaison est vive : rend si cela change quelque chose, `null` quand l'envoyeur est inconnu.
const updateFilming = (roster: Roster, phoneId: string, isFilming: boolean): boolean | null => {
  const phone = roster.phones.get(phoneId);
  if (!phone) return null;
  const isChanged = phone.isFilming !== isFilming;
  phone.isFilming = isFilming;
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
    openPhone({ id, role, number: wanted }, send) {
      const previous = roster.phones.get(id);
      const entry: PhoneEntry = {
        id,
        role,
        number: assignNumber(roster, id, role, wanted),
        send,
        shownScreen: undefined,
        isFilming: true,
      };
      roster.phones.set(id, entry);
      send({ kind: "number", number: entry.number });
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
    openScreen({ id, number }, send) {
      const entry: ScreenEntry = { id, number, send, isPhoneShown: undefined, isLinked: false };
      roster.screens = [...roster.screens.filter((screen) => screen.id !== id), entry];
      notify(roster, number);
      publish();
      log(`Page OBS de la caméra ${number} connectée.`);
      return () => {
        if (!roster.screens.includes(entry)) return;
        roster.screens = roster.screens.filter((screen) => screen !== entry);
        notify(roster, number);
        publish();
        log(`Page OBS de la caméra ${number} déconnectée.`);
      };
    },
    updateNumber(phoneId, number) {
      const phone = roster.phones.get(phoneId);
      if (!phone) return { ok: false, status: 404, message: NOT_FOUND_PHONE };
      const previous = phone.number;
      if (previous === null) return { ok: false, status: 409, message: "ce rôle n'a pas de caméra" };
      if (previous === number) return { ok: true, number };
      if (getPhoneOf(roster, number)) {
        return {
          ok: false,
          status: 409,
          message: `la caméra ${number} est déjà prise par un autre téléphone`,
        };
      }
      phone.number = number;
      phone.shownScreen = undefined;
      phone.send({ kind: "number", number });
      notify(roster, previous);
      notify(roster, number);
      publish();
      log(`${toPhoneName(phone)} : la caméra ${previous} devient la caméra ${number}.`);
      return { ok: true, number };
    },
    relay: (request) =>
      request.from === "phone"
        ? relayFromPhone(roster, request.phoneId, request.signal)
        : relayFromScreen(roster, request.screenId, request.signal),
    updateLink(request) {
      const isChanged =
        request.from === "phone"
          ? updateFilming(roster, request.phoneId, request.isFilming)
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
