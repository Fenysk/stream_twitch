import { describe, expect, it } from "vitest";
import type { PhoneEvent, PhoneRole, ScreenEvent, ScreenKind, Signal } from "../domain/phone.schema";
import { createPhones } from "./phone.usecase";

const OFFER: Signal = { kind: "offer", session: "session-0001", description: "v=0" };
const ANSWER: Signal = { kind: "answer", session: "session-0001", description: "v=0 reponse" };

// Un téléphone ou une page OBS connectés : ce qu'ils reçoivent s'empile, `close` les déconnecte.
const setup = () => {
  const logs: string[] = [];
  const phones = createPhones({ log: (line) => logs.push(line) });
  // Ouvre le flux d'un téléphone : sans numéro tant qu'il ne filme pas. Une Caméra ou un Selfie filme dès l'ouverture (`role` ne sert qu'à le
  // dire) : son téléphone appuie sur Filmer par la liaison, le flux reste le même.
  const openPhone = (id: string, number?: number) => {
    const events: PhoneEvent[] = [];
    const close = phones.openPhone({ id, number }, (event) => events.push(event));
    return { events, close };
  };
  const updateFilm = (id: string, isCamera: boolean, isFilming = isCamera) =>
    phones.updateLink({ from: "phone", phoneId: id, isCamera, isFilming });
  const connectPhone = (id: string, role: PhoneRole = "camera", number?: number) => {
    const phone = openPhone(id, number);
    if (role !== "control") updateFilm(id, true);
    return phone;
  };
  const connectScreen = (id: string, number: number, kind: ScreenKind = "image") => {
    const events: ScreenEvent[] = [];
    const close = phones.openScreen({ id, number, kind }, (event) => events.push(event));
    return { events, close };
  };
  return { phones, logs, openPhone, updateFilm, connectPhone, connectScreen };
};

const numbersOf = (events: PhoneEvent[]): (number | null)[] =>
  events.flatMap((event) => (event.kind === "number" ? [event.number] : []));

// Ce que le téléphone a appris de la page active d'une sorte, dans l'ordre.
const screensOf = (events: PhoneEvent[], screenKind: ScreenKind): (string | null)[] =>
  events.flatMap((event) =>
    event.kind === "screen" && event.screenKind === screenKind ? [event.screenId] : [],
  );

describe("Les numéros de caméra", () => {
  it("Quand un premier téléphone Caméra se connecte sans numéro, le système doit lui donner le 1", () => {
    const { connectPhone } = setup();
    expect(numbersOf(connectPhone("phone-aaaa").events)).toEqual([1]);
  });

  it("donne ensuite le plus petit numéro libre, et reprend un numéro libéré", () => {
    const { connectPhone } = setup();
    const first = connectPhone("phone-aaaa");
    expect(numbersOf(connectPhone("phone-bbbb").events)).toEqual([2]);
    first.close();
    expect(numbersOf(connectPhone("phone-cccc").events)).toEqual([1]);
  });

  it("rend à un téléphone qui revient le numéro qu'il avait gardé, s'il est libre", () => {
    const { connectPhone } = setup();
    expect(numbersOf(connectPhone("phone-aaaa", "camera", 5).events)).toEqual([5]);
  });

  it("Si le numéro gardé par un téléphone est pris par un autre, alors le système doit lui donner le plus petit numéro libre", () => {
    const { connectPhone } = setup();
    connectPhone("phone-aaaa", "camera", 1);
    expect(numbersOf(connectPhone("phone-bbbb", "camera", 1).events)).toEqual([2]);
  });

  it("donne un numéro au Selfie comme à la caméra, et aucun à la régie", () => {
    const { connectPhone } = setup();
    expect(numbersOf(connectPhone("phone-aaaa", "selfie").events)).toEqual([1]);
    expect(numbersOf(connectPhone("phone-bbbb", "control").events)).toEqual([]);
    expect(numbersOf(connectPhone("phone-cccc", "camera").events)).toEqual([2]);
  });

  it("Quand le même téléphone se reconnecte, sa nouvelle connexion doit remplacer l'ancienne sans libérer sa place", () => {
    const { phones, connectPhone } = setup();
    const stale = connectPhone("phone-aaaa");
    const fresh = connectPhone("phone-aaaa", "camera", 1);
    expect(numbersOf(fresh.events)).toEqual([1]);
    stale.close();
    expect(phones.getState().map(({ id, number }) => `${id}:${number}`)).toEqual(["phone-aaaa:1"]);
    fresh.close();
    expect(phones.getState()).toEqual([]);
  });
});

describe("Le changement de numéro", () => {
  it("Quand le numéro demandé est libre, le système doit le donner et le dire au téléphone", () => {
    const { phones, connectPhone } = setup();
    const phone = connectPhone("phone-aaaa");
    expect(phones.updateNumber("phone-aaaa", 7)).toEqual({ ok: true, number: 7 });
    expect(numbersOf(phone.events)).toEqual([1, 7]);
    expect(phones.getState().map(({ number }) => number)).toEqual([7]);
  });

  it("Si le numéro demandé est pris par un autre téléphone, alors le système doit refuser (409) et ne rien changer", () => {
    const { phones, connectPhone } = setup();
    const phone = connectPhone("phone-aaaa");
    connectPhone("phone-bbbb");
    const result = phones.updateNumber("phone-aaaa", 2);
    expect(result).toEqual({
      ok: false,
      status: 409,
      message: "la caméra 2 est déjà prise par un autre téléphone",
    });
    expect(numbersOf(phone.events)).toEqual([1]);
  });

  it("garde le numéro quand on redemande le sien", () => {
    const { phones, connectPhone } = setup();
    connectPhone("phone-aaaa");
    expect(phones.updateNumber("phone-aaaa", 1)).toEqual({ ok: true, number: 1 });
  });

  it("refuse (404) un téléphone inconnu, et (409) un téléphone sans caméra", () => {
    const { phones, connectPhone } = setup();
    connectPhone("phone-bbbb", "control");
    expect(phones.updateNumber("phone-zzzz", 2)).toMatchObject({ ok: false, status: 404 });
    expect(phones.updateNumber("phone-bbbb", 2)).toMatchObject({ ok: false, status: 409 });
  });

  it("Quand le téléphone change de numéro, l'ancienne page OBS doit apprendre qu'il est parti et la nouvelle qu'il est là", () => {
    const { phones, connectPhone, connectScreen } = setup();
    const firstScreen = connectScreen("screen-0001", 1);
    const movedScreen = connectScreen("screen-0007", 7);
    const phone = connectPhone("phone-aaaa");
    phones.updateNumber("phone-aaaa", 7);
    expect(firstScreen.events).toEqual([
      { kind: "phone", isPresent: false },
      { kind: "phone", isPresent: true },
      { kind: "phone", isPresent: false },
    ]);
    expect(movedScreen.events).toEqual([
      { kind: "phone", isPresent: false },
      { kind: "phone", isPresent: true },
    ]);
    expect(phone.events.filter((event) => event.kind === "screen" && event.screenKind === "image")).toEqual([
      { kind: "screen", screenKind: "image", screenId: "screen-0001" },
      { kind: "screen", screenKind: "image", screenId: "screen-0007" },
    ]);
  });
});

describe("La mise en relation d'un téléphone et de la page OBS de son numéro", () => {
  it("Quand la page OBS est déjà là, le système doit dire au téléphone son identifiant, et à la page que le téléphone est là", () => {
    const { connectPhone, connectScreen } = setup();
    const screen = connectScreen("screen-0001", 1);
    expect(screen.events).toEqual([{ kind: "phone", isPresent: false }]);
    const phone = connectPhone("phone-aaaa");
    expect(phone.events).toEqual([
      { kind: "number", number: 1 },
      { kind: "screen", screenKind: "image", screenId: "screen-0001" },
      { kind: "screen", screenKind: "mic", screenId: null },
    ]);
    expect(screen.events).toEqual([
      { kind: "phone", isPresent: false },
      { kind: "phone", isPresent: true },
    ]);
  });

  it("Quand la page OBS s'ouvre après le téléphone, le système doit le dire aux deux", () => {
    const { connectPhone, connectScreen } = setup();
    const phone = connectPhone("phone-aaaa");
    expect(phone.events).toEqual([
      { kind: "number", number: 1 },
      { kind: "screen", screenKind: "image", screenId: null },
      { kind: "screen", screenKind: "mic", screenId: null },
    ]);
    const screen = connectScreen("screen-0001", 1);
    expect(screen.events).toEqual([{ kind: "phone", isPresent: true }]);
    expect(phone.events.at(-1)).toEqual({ kind: "screen", screenKind: "image", screenId: "screen-0001" });
  });

  it("Quand le téléphone se ferme, la page OBS doit apprendre qu'il est parti ; quand la page se ferme, le téléphone doit l'apprendre", () => {
    const { connectPhone, connectScreen } = setup();
    const screen = connectScreen("screen-0001", 1);
    const phone = connectPhone("phone-aaaa");
    phone.close();
    expect(screen.events.at(-1)).toEqual({ kind: "phone", isPresent: false });
    const again = connectPhone("phone-aaaa", "camera", 1);
    screen.close();
    expect(again.events.at(-1)).toEqual({ kind: "screen", screenKind: "image", screenId: null });
  });

  it("n'envoie rien à ceux qu'un autre numéro concerne, ni deux fois la même chose", () => {
    const { connectPhone, connectScreen } = setup();
    const other = connectScreen("screen-0002", 2);
    const phone = connectPhone("phone-aaaa");
    connectScreen("screen-0003", 3);
    expect(other.events).toEqual([{ kind: "phone", isPresent: false }]);
    expect(phone.events).toHaveLength(3);
  });

  it("Quand deux pages OBS ont le même numéro, le système doit garder la dernière ouverte active, et rendre la place à l'ancienne quand elle se ferme", () => {
    const { connectPhone, connectScreen } = setup();
    const oldest = connectScreen("screen-0001", 1);
    const phone = connectPhone("phone-aaaa");
    const newest = connectScreen("screen-0002", 1);
    expect(phone.events.at(-1)).toEqual({ kind: "screen", screenKind: "image", screenId: "screen-0002" });
    expect(oldest.events.at(-1)).toEqual({ kind: "phone", isPresent: false });
    expect(newest.events.at(-1)).toEqual({ kind: "phone", isPresent: true });
    newest.close();
    expect(phone.events.at(-1)).toEqual({ kind: "screen", screenKind: "image", screenId: "screen-0001" });
    expect(oldest.events.at(-1)).toEqual({ kind: "phone", isPresent: true });
  });

  it("Quand une page OBS se reconnecte avec le même identifiant, sa nouvelle connexion doit remplacer l'ancienne", () => {
    const { phones, connectScreen, connectPhone } = setup();
    const stale = connectScreen("screen-0001", 1);
    const fresh = connectScreen("screen-0001", 1);
    connectPhone("phone-aaaa");
    stale.close();
    expect(phones.getState()[0]?.hasScreen).toBe(true);
    expect(fresh.events.at(-1)).toEqual({ kind: "phone", isPresent: true });
  });
});

describe("Le passage des signaux", () => {
  it("Quand le téléphone envoie une offre, le système doit la faire passer à la page OBS active de son numéro", () => {
    const { phones, connectPhone, connectScreen } = setup();
    const oldest = connectScreen("screen-0001", 1);
    const active = connectScreen("screen-0002", 1);
    connectPhone("phone-aaaa");
    expect(
      phones.relay({ from: "phone", phoneId: "phone-aaaa", screenKind: "image", signal: OFFER }),
    ).toEqual({
      ok: true,
      isDelivered: true,
    });
    expect(active.events.at(-1)).toEqual({ kind: "signal", signal: OFFER });
    expect(oldest.events).not.toContainEqual({ kind: "signal", signal: OFFER });
  });

  it("Quand la page OBS répond, le système doit faire passer la réponse au téléphone", () => {
    const { phones, connectPhone, connectScreen } = setup();
    connectScreen("screen-0001", 1);
    const phone = connectPhone("phone-aaaa");
    expect(phones.relay({ from: "screen", screenId: "screen-0001", signal: ANSWER })).toEqual({
      ok: true,
      isDelivered: true,
    });
    expect(phone.events.at(-1)).toEqual({ kind: "signal", screenKind: "image", signal: ANSWER });
  });

  it("Si la page OBS n'est pas là, alors le signal du téléphone est perdu sans erreur", () => {
    const { phones, connectPhone } = setup();
    connectPhone("phone-aaaa");
    expect(
      phones.relay({ from: "phone", phoneId: "phone-aaaa", screenKind: "image", signal: OFFER }),
    ).toEqual({
      ok: true,
      isDelivered: false,
    });
  });

  it("Si la page OBS n'est plus la page active de son numéro, alors sa réponse n'arrive pas au téléphone", () => {
    const { phones, connectPhone, connectScreen } = setup();
    connectScreen("screen-0001", 1);
    connectScreen("screen-0002", 1);
    const phone = connectPhone("phone-aaaa");
    expect(phones.relay({ from: "screen", screenId: "screen-0001", signal: ANSWER })).toEqual({
      ok: true,
      isDelivered: false,
    });
    expect(phone.events).not.toContainEqual({ kind: "signal", screenKind: "image", signal: ANSWER });
  });

  it("Si l'envoyeur est inconnu, alors le système doit refuser (404)", () => {
    const { phones } = setup();
    expect(
      phones.relay({ from: "phone", phoneId: "phone-zzzz", screenKind: "image", signal: OFFER }),
    ).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(phones.relay({ from: "screen", screenId: "screen-zzzz", signal: ANSWER })).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it("ne fait rien passer pour une régie, qui n'a pas de caméra", () => {
    const { phones, connectPhone } = setup();
    connectPhone("phone-aaaa", "control");
    expect(
      phones.relay({ from: "phone", phoneId: "phone-aaaa", screenKind: "image", signal: OFFER }),
    ).toEqual({
      ok: true,
      isDelivered: false,
    });
  });
});

describe("Les téléphones connectés", () => {
  it("liste chaque téléphone avec son numéro (aucun s'il ne filme pas) et sa page OBS, dans l'ordre des numéros", () => {
    const { phones, connectPhone, connectScreen } = setup();
    connectPhone("phone-cccc", "control");
    connectPhone("phone-bbbb", "selfie", 2);
    connectPhone("phone-aaaa", "camera", 1);
    connectScreen("screen-0001", 1);
    expect(phones.getState()).toEqual([
      {
        id: "phone-aaaa",
        number: 1,
        hasScreen: true,
        hasMicScreen: false,
        isReceiving: false,
        isHeard: false,
      },
      {
        id: "phone-bbbb",
        number: 2,
        hasScreen: false,
        hasMicScreen: false,
        isReceiving: false,
        isHeard: false,
      },
      {
        id: "phone-cccc",
        number: null,
        hasScreen: false,
        hasMicScreen: false,
        isReceiving: false,
        isHeard: false,
      },
    ]);
  });

  it("prévient ceux qui écoutent à chaque connexion, déconnexion, page OBS et changement de numéro, tant qu'ils écoutent", () => {
    const { phones, connectPhone, connectScreen } = setup();
    const seen: number[] = [];
    const stop = phones.subscribe((list) => seen.push(list.length));
    const phone = connectPhone("phone-aaaa");
    const screen = connectScreen("screen-0001", 1);
    phones.updateNumber("phone-aaaa", 2);
    screen.close();
    phone.close();
    expect(seen).toEqual([1, 1, 1, 1, 1, 0]);
    stop();
    connectPhone("phone-bbbb");
    expect(seen).toHaveLength(6);
  });

  it("dit dans le journal quel téléphone arrive et part, et quand il filme avec son numéro", () => {
    const { logs, connectPhone } = setup();
    const phone = connectPhone("phone-aaaa", "selfie");
    phone.close();
    expect(logs).toEqual([
      "Téléphone phon connecté.",
      "Téléphone phon filme : caméra 1.",
      "Téléphone phon déconnecté.",
    ]);
  });
});

describe("La liaison qui arrive jusqu'à OBS", () => {
  const receivingOf = (phones: ReturnType<typeof setup>["phones"]): boolean[] =>
    phones.getState().map(({ isReceiving }) => isReceiving);

  it("ne dit pas l'image reçue tant que la page OBS n'a pas dit sa liaison vive", () => {
    const { phones, connectPhone, connectScreen } = setup();
    connectPhone("phone-aaaa");
    expect(receivingOf(phones)).toEqual([false]);
    connectScreen("screen-0001", 1);
    expect(receivingOf(phones)).toEqual([false]);
  });

  it("dit l'image reçue quand la page OBS de son numéro a une liaison vive et que le téléphone filme", () => {
    const { phones, connectPhone, connectScreen } = setup();
    connectPhone("phone-aaaa");
    connectScreen("screen-0001", 1);
    expect(phones.updateLink({ from: "screen", screenId: "screen-0001", isLinked: true })).toEqual({
      ok: true,
    });
    expect(receivingOf(phones)).toEqual([true]);
    phones.updateLink({ from: "screen", screenId: "screen-0001", isLinked: false });
    expect(receivingOf(phones)).toEqual([false]);
  });

  it("retire l'image reçue quand le téléphone dit que sa caméra est arrêtée, et la rend quand elle repart", () => {
    const { phones, connectPhone, connectScreen } = setup();
    connectPhone("phone-aaaa");
    connectScreen("screen-0001", 1);
    phones.updateLink({ from: "screen", screenId: "screen-0001", isLinked: true });
    phones.updateLink({ from: "phone", phoneId: "phone-aaaa", isCamera: true, isFilming: false });
    expect(receivingOf(phones)).toEqual([false]);
    phones.updateLink({ from: "phone", phoneId: "phone-aaaa", isCamera: true, isFilming: true });
    expect(receivingOf(phones)).toEqual([true]);
  });

  it("ne compte que la page active du numéro : une ancienne page qui dit sa liaison vive ne suffit pas", () => {
    const { phones, connectPhone, connectScreen } = setup();
    connectPhone("phone-aaaa");
    connectScreen("screen-0001", 1);
    connectScreen("screen-0002", 1);
    phones.updateLink({ from: "screen", screenId: "screen-0001", isLinked: true });
    expect(receivingOf(phones)).toEqual([false]);
    phones.updateLink({ from: "screen", screenId: "screen-0002", isLinked: true });
    expect(receivingOf(phones)).toEqual([true]);
  });

  it("repart de zéro quand la page OBS se reconnecte ou que sa page active part", () => {
    const { phones, connectPhone, connectScreen } = setup();
    connectPhone("phone-aaaa");
    connectScreen("screen-0001", 1);
    phones.updateLink({ from: "screen", screenId: "screen-0001", isLinked: true });
    const reopened = connectScreen("screen-0001", 1);
    expect(receivingOf(phones)).toEqual([false]);
    phones.updateLink({ from: "screen", screenId: "screen-0001", isLinked: true });
    reopened.close();
    expect(receivingOf(phones)).toEqual([false]);
  });

  it("repart de zéro quand le téléphone se reconnecte : il redit s'il ne filme pas", () => {
    const { phones, connectPhone, connectScreen } = setup();
    connectPhone("phone-aaaa");
    connectScreen("screen-0001", 1);
    phones.updateLink({ from: "screen", screenId: "screen-0001", isLinked: true });
    phones.updateLink({ from: "phone", phoneId: "phone-aaaa", isCamera: true, isFilming: false });
    connectPhone("phone-aaaa");
    expect(receivingOf(phones)).toEqual([true]);
  });

  it("ne dit jamais l'image reçue d'un téléphone sans numéro de caméra", () => {
    const { phones, connectPhone } = setup();
    connectPhone("phone-cccc", "control");
    expect(receivingOf(phones)).toEqual([false]);
  });

  it("refuse en 404 un téléphone ou une page inconnus, sans rien publier", () => {
    const { phones } = setup();
    const seen: number[] = [];
    phones.subscribe((list) => seen.push(list.length));
    expect(
      phones.updateLink({ from: "phone", phoneId: "phone-zzzz", isCamera: false, isFilming: false }),
    ).toEqual({
      ok: false,
      status: 404,
      message: "téléphone inconnu : rouvre /mobile",
    });
    expect(phones.updateLink({ from: "screen", screenId: "screen-zzzz", isLinked: true })).toEqual({
      ok: false,
      status: 404,
      message: "page de caméra inconnue : recharge la source",
    });
    expect(seen).toEqual([]);
  });

  it("ne prévient ceux qui écoutent que d'un vrai changement", () => {
    const { phones, connectPhone, connectScreen } = setup();
    connectPhone("phone-aaaa");
    connectScreen("screen-0001", 1);
    const notices: string[] = [];
    phones.subscribe((list) => notices.push(list.map(({ isReceiving }) => String(isReceiving)).join(",")));
    phones.updateLink({ from: "screen", screenId: "screen-0001", isLinked: true });
    phones.updateLink({ from: "screen", screenId: "screen-0001", isLinked: true });
    phones.updateLink({ from: "phone", phoneId: "phone-aaaa", isCamera: true, isFilming: true });
    expect(notices).toEqual(["true"]);
  });
});

describe("Filmer : un téléphone, un seul flux qui filme ou non", () => {
  it("Quand un téléphone ouvre son flux sans filmer, le système ne doit lui donner aucun numéro et ne rien lui envoyer", () => {
    const { phones, openPhone } = setup();
    const phone = openPhone("phone-aaaa");
    expect(phone.events).toEqual([]);
    expect(phones.getState()).toEqual([
      {
        id: "phone-aaaa",
        number: null,
        hasScreen: false,
        hasMicScreen: false,
        isReceiving: false,
        isHeard: false,
      },
    ]);
  });

  it("ne donne un numéro qu'au premier Filmer : un téléphone qui ne filme jamais n'en prend pas", () => {
    const { phones, openPhone, updateFilm } = setup();
    openPhone("phone-aaaa");
    const camera = openPhone("phone-bbbb");
    expect(updateFilm("phone-bbbb", true, false)).toEqual({ ok: true });
    expect(numbersOf(camera.events)).toEqual([1]);
    expect(phones.getState().map(({ id, number }) => `${id}:${number}`)).toEqual([
      "phone-bbbb:1",
      "phone-aaaa:null",
    ]);
  });

  it("Quand un téléphone filme, le système doit le dire sur le même flux, avec la page OBS du numéro, sans l'ouvrir de nouveau", () => {
    const { openPhone, updateFilm, connectScreen } = setup();
    connectScreen("screen-0001", 1);
    const phone = openPhone("phone-aaaa");
    updateFilm("phone-aaaa", true, false);
    expect(phone.events).toEqual([
      { kind: "number", number: 1 },
      { kind: "screen", screenKind: "image", screenId: "screen-0001" },
      { kind: "screen", screenKind: "mic", screenId: null },
    ]);
  });

  it("prend le numéro que le téléphone a gardé à l'ouverture, s'il est libre, au premier Filmer", () => {
    const { openPhone, updateFilm } = setup();
    const phone = openPhone("phone-aaaa", 4);
    expect(numbersOf(phone.events)).toEqual([]);
    updateFilm("phone-aaaa", true);
    expect(numbersOf(phone.events)).toEqual([4]);
  });

  it("Quand le téléphone arrête de filmer, le système doit rendre son numéro, le dire (number: null) et prévenir la page OBS qu'il est parti", () => {
    const { phones, openPhone, updateFilm, connectScreen } = setup();
    const screen = connectScreen("screen-0001", 1);
    const phone = openPhone("phone-aaaa");
    updateFilm("phone-aaaa", true);
    updateFilm("phone-aaaa", false);
    expect(numbersOf(phone.events)).toEqual([1, null]);
    expect(phone.events.at(-1)).toEqual({ kind: "number", number: null });
    expect(screen.events.at(-1)).toEqual({ kind: "phone", isPresent: false });
    expect(phones.getState()).toEqual([
      {
        id: "phone-aaaa",
        number: null,
        hasScreen: false,
        hasMicScreen: false,
        isReceiving: false,
        isHeard: false,
      },
    ]);
  });

  it("rend le même numéro au prochain Filmer, s'il est libre, sinon le plus petit libre", () => {
    const { openPhone, updateFilm } = setup();
    const first = openPhone("phone-aaaa");
    updateFilm("phone-aaaa", true);
    updateFilm("phone-aaaa", false);
    updateFilm("phone-aaaa", true);
    expect(numbersOf(first.events)).toEqual([1, null, 1]);
    updateFilm("phone-aaaa", false);
    const second = openPhone("phone-bbbb");
    updateFilm("phone-bbbb", true);
    updateFilm("phone-aaaa", true);
    expect(numbersOf(second.events)).toEqual([1]);
    expect(numbersOf(first.events)).toEqual([1, null, 1, null, 2]);
  });

  it("garde le numéro et l'état d'une caméra quand son téléphone rouvre le flux : aucun trou où un autre prendrait sa place", () => {
    const { phones, openPhone, updateFilm } = setup();
    openPhone("phone-aaaa");
    updateFilm("phone-aaaa", true);
    const reopened = openPhone("phone-aaaa");
    expect(numbersOf(reopened.events)).toEqual([1]);
    expect(phones.getState().map(({ id, number }) => `${id}:${number}`)).toEqual(["phone-aaaa:1"]);
    updateFilm("phone-aaaa", true);
    expect(numbersOf(reopened.events)).toEqual([1]);
  });

  it("n'affirme pas qu'un téléphone envoie une image sans qu'il filme : isFilming seul ne suffit pas", () => {
    const { phones, openPhone, updateFilm, connectScreen } = setup();
    openPhone("phone-aaaa");
    connectScreen("screen-0001", 1);
    phones.updateLink({ from: "screen", screenId: "screen-0001", isLinked: true });
    updateFilm("phone-aaaa", false, true);
    expect(phones.getState().map(({ isReceiving }) => isReceiving)).toEqual([false]);
  });

  it("refuse (409) un changement de numéro à un téléphone qui ne filme pas, et ne publie que les vrais changements de Filmer", () => {
    const { phones, openPhone, updateFilm } = setup();
    openPhone("phone-aaaa");
    expect(phones.updateNumber("phone-aaaa", 3)).toMatchObject({ ok: false, status: 409 });
    const seen: number[] = [];
    phones.subscribe((list) => seen.push(list.length));
    updateFilm("phone-aaaa", true);
    updateFilm("phone-aaaa", true);
    updateFilm("phone-aaaa", true, false);
    updateFilm("phone-aaaa", false);
    updateFilm("phone-aaaa", false);
    expect(seen).toEqual([1, 1, 1]);
  });

  it("dit dans le journal qu'un téléphone arrête de filmer", () => {
    const { logs, openPhone, updateFilm } = setup();
    openPhone("phone-aaaa");
    updateFilm("phone-aaaa", true);
    updateFilm("phone-aaaa", false);
    expect(logs).toEqual([
      "Téléphone phon connecté.",
      "Téléphone phon filme : caméra 1.",
      "Téléphone phon ne filme plus (caméra 1 rendue).",
    ]);
  });
});

describe("La page mic d'une caméra : une sorte de page à part", () => {
  it("Quand la page mic s'ouvre, le système doit le dire au téléphone sous la sorte mic, sans toucher à la page image", () => {
    const { connectPhone, connectScreen } = setup();
    const image = connectScreen("screen-0001", 1);
    const phone = connectPhone("phone-aaaa");
    const mic = connectScreen("screen-0002", 1, "mic");
    expect(screensOf(phone.events, "image")).toEqual(["screen-0001"]);
    expect(screensOf(phone.events, "mic")).toEqual([null, "screen-0002"]);
    expect(mic.events).toEqual([{ kind: "phone", isPresent: true }]);
    expect(image.events).toEqual([
      { kind: "phone", isPresent: false },
      { kind: "phone", isPresent: true },
    ]);
  });

  it("garde une page active par sorte : une page image ne remplace pas la page mic, et deux pages mic se relaient", () => {
    const { connectPhone, connectScreen } = setup();
    const phone = connectPhone("phone-aaaa");
    const firstMic = connectScreen("screen-0001", 1, "mic");
    connectScreen("screen-0002", 1);
    const secondMic = connectScreen("screen-0003", 1, "mic");
    expect(screensOf(phone.events, "mic")).toEqual([null, "screen-0001", "screen-0003"]);
    expect(screensOf(phone.events, "image")).toEqual([null, "screen-0002"]);
    expect(firstMic.events.at(-1)).toEqual({ kind: "phone", isPresent: false });
    secondMic.close();
    expect(screensOf(phone.events, "mic").at(-1)).toBe("screen-0001");
    expect(firstMic.events.at(-1)).toEqual({ kind: "phone", isPresent: true });
  });

  it("Quand le téléphone change de numéro, la page mic de l'ancien numéro doit apprendre qu'il est parti et celle du nouveau qu'il est là", () => {
    const { phones, connectPhone, connectScreen } = setup();
    const firstMic = connectScreen("screen-0001", 1, "mic");
    const movedMic = connectScreen("screen-0007", 7, "mic");
    const phone = connectPhone("phone-aaaa");
    phones.updateNumber("phone-aaaa", 7);
    expect(firstMic.events).toEqual([
      { kind: "phone", isPresent: false },
      { kind: "phone", isPresent: true },
      { kind: "phone", isPresent: false },
    ]);
    expect(movedMic.events).toEqual([
      { kind: "phone", isPresent: false },
      { kind: "phone", isPresent: true },
    ]);
    expect(screensOf(phone.events, "mic")).toEqual(["screen-0001", "screen-0007"]);
  });

  it("Quand le téléphone envoie une offre au mic, le système doit la faire passer à la page mic active, pas à la page image", () => {
    const { phones, connectPhone, connectScreen } = setup();
    const image = connectScreen("screen-0001", 1);
    const mic = connectScreen("screen-0002", 1, "mic");
    connectPhone("phone-aaaa");
    expect(phones.relay({ from: "phone", phoneId: "phone-aaaa", screenKind: "mic", signal: OFFER })).toEqual({
      ok: true,
      isDelivered: true,
    });
    expect(mic.events.at(-1)).toEqual({ kind: "signal", signal: OFFER });
    expect(image.events).not.toContainEqual({ kind: "signal", signal: OFFER });
  });

  it("Quand la page mic répond, le système doit faire passer la réponse au téléphone sous la sorte mic", () => {
    const { phones, connectPhone, connectScreen } = setup();
    connectScreen("screen-0001", 1);
    connectScreen("screen-0002", 1, "mic");
    const phone = connectPhone("phone-aaaa");
    expect(phones.relay({ from: "screen", screenId: "screen-0002", signal: ANSWER })).toEqual({
      ok: true,
      isDelivered: true,
    });
    expect(phone.events.at(-1)).toEqual({ kind: "signal", screenKind: "mic", signal: ANSWER });
  });

  it("Si la page mic n'est pas là, alors le signal du téléphone vers le mic est perdu, même quand la page image y est", () => {
    const { phones, connectPhone, connectScreen } = setup();
    const image = connectScreen("screen-0001", 1);
    connectPhone("phone-aaaa");
    expect(phones.relay({ from: "phone", phoneId: "phone-aaaa", screenKind: "mic", signal: OFFER })).toEqual({
      ok: true,
      isDelivered: false,
    });
    expect(image.events).not.toContainEqual({ kind: "signal", signal: OFFER });
  });

  it("dit dans le journal de quelle sorte est la page qui arrive et part", () => {
    const { logs, connectScreen } = setup();
    connectScreen("screen-0001", 3).close();
    connectScreen("screen-0002", 3, "mic").close();
    expect(logs).toEqual([
      "Page OBS de la caméra 3 connectée.",
      "Page OBS de la caméra 3 déconnectée.",
      "Page mic de la caméra 3 connectée.",
      "Page mic de la caméra 3 déconnectée.",
    ]);
  });
});

describe("Le mic qui arrive jusqu'à OBS", () => {
  const heardOf = (phones: ReturnType<typeof setup>["phones"]): boolean[] =>
    phones.getState().map(({ isHeard }) => isHeard);
  const receivingOf = (phones: ReturnType<typeof setup>["phones"]): boolean[] =>
    phones.getState().map(({ isReceiving }) => isReceiving);

  it("dit la page mic ouverte à part de la page image", () => {
    const { phones, connectPhone, connectScreen } = setup();
    connectPhone("phone-aaaa");
    connectScreen("screen-0001", 1, "mic");
    expect(phones.getState().map(({ hasScreen, hasMicScreen }) => [hasScreen, hasMicScreen])).toEqual([
      [false, true],
    ]);
  });

  it("ne dit pas le mic entendu tant que la page mic n'a pas dit sa liaison vive", () => {
    const { phones, connectPhone, connectScreen } = setup();
    connectPhone("phone-aaaa");
    expect(heardOf(phones)).toEqual([false]);
    connectScreen("screen-0001", 1, "mic");
    expect(heardOf(phones)).toEqual([false]);
  });

  it("dit le mic entendu quand la page mic de son numéro a une liaison vive et que le téléphone filme, sans dire l'image reçue", () => {
    const { phones, connectPhone, connectScreen } = setup();
    connectPhone("phone-aaaa");
    connectScreen("screen-0001", 1);
    connectScreen("screen-0002", 1, "mic");
    expect(phones.updateLink({ from: "screen", screenId: "screen-0002", isLinked: true })).toEqual({
      ok: true,
    });
    expect(heardOf(phones)).toEqual([true]);
    expect(receivingOf(phones)).toEqual([false]);
    phones.updateLink({ from: "screen", screenId: "screen-0002", isLinked: false });
    expect(heardOf(phones)).toEqual([false]);
  });

  it("garde la liaison de chaque sorte à part : la page image vive ne fait pas entendre le mic, la page mic vive ne fait pas recevoir l'image", () => {
    const { phones, connectPhone, connectScreen } = setup();
    connectPhone("phone-aaaa");
    connectScreen("screen-0001", 1);
    connectScreen("screen-0002", 1, "mic");
    phones.updateLink({ from: "screen", screenId: "screen-0001", isLinked: true });
    expect(receivingOf(phones)).toEqual([true]);
    expect(heardOf(phones)).toEqual([false]);
    phones.updateLink({ from: "screen", screenId: "screen-0002", isLinked: true });
    phones.updateLink({ from: "screen", screenId: "screen-0001", isLinked: false });
    expect(receivingOf(phones)).toEqual([false]);
    expect(heardOf(phones)).toEqual([true]);
  });

  it("retire le mic entendu quand le téléphone dit que sa caméra est arrêtée, et le rend quand elle repart", () => {
    const { phones, connectPhone, connectScreen } = setup();
    connectPhone("phone-aaaa");
    connectScreen("screen-0001", 1, "mic");
    phones.updateLink({ from: "screen", screenId: "screen-0001", isLinked: true });
    phones.updateLink({ from: "phone", phoneId: "phone-aaaa", isCamera: true, isFilming: false });
    expect(heardOf(phones)).toEqual([false]);
    phones.updateLink({ from: "phone", phoneId: "phone-aaaa", isCamera: true, isFilming: true });
    expect(heardOf(phones)).toEqual([true]);
  });

  it("ne compte que la page mic active du numéro : une ancienne page mic vive ne suffit pas", () => {
    const { phones, connectPhone, connectScreen } = setup();
    connectPhone("phone-aaaa");
    connectScreen("screen-0001", 1, "mic");
    connectScreen("screen-0002", 1, "mic");
    phones.updateLink({ from: "screen", screenId: "screen-0001", isLinked: true });
    expect(heardOf(phones)).toEqual([false]);
    phones.updateLink({ from: "screen", screenId: "screen-0002", isLinked: true });
    expect(heardOf(phones)).toEqual([true]);
  });

  it("repart de zéro quand la page mic se reconnecte ou que sa page active part", () => {
    const { phones, connectPhone, connectScreen } = setup();
    connectPhone("phone-aaaa");
    connectScreen("screen-0001", 1, "mic");
    phones.updateLink({ from: "screen", screenId: "screen-0001", isLinked: true });
    const reopened = connectScreen("screen-0001", 1, "mic");
    expect(heardOf(phones)).toEqual([false]);
    phones.updateLink({ from: "screen", screenId: "screen-0001", isLinked: true });
    reopened.close();
    expect(heardOf(phones)).toEqual([false]);
  });

  it("ne dit jamais le mic entendu d'un téléphone sans numéro de caméra", () => {
    const { phones, connectPhone } = setup();
    connectPhone("phone-cccc", "control");
    expect(heardOf(phones)).toEqual([false]);
  });

  it("ne prévient ceux qui écoutent que d'un vrai changement du mic", () => {
    const { phones, connectPhone, connectScreen } = setup();
    connectPhone("phone-aaaa");
    connectScreen("screen-0001", 1, "mic");
    const notices: string[] = [];
    phones.subscribe((list) => notices.push(list.map(({ isHeard }) => String(isHeard)).join(",")));
    phones.updateLink({ from: "screen", screenId: "screen-0001", isLinked: true });
    phones.updateLink({ from: "screen", screenId: "screen-0001", isLinked: true });
    phones.updateLink({ from: "phone", phoneId: "phone-aaaa", isCamera: true, isFilming: true });
    expect(notices).toEqual(["true"]);
  });
});
