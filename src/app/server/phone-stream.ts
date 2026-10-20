import { isLiveMicOf } from "../../domain/control.rules";
import type { ControlState } from "../../domain/control.schema";
import { PHONE_KEEPALIVE_EVENT, PHONE_KEEPALIVE_MS, type PhoneEvent } from "../../domain/phone.schema";
import { toPictureStanding } from "../../domain/picture.rules";
import type { Control } from "../../usecase/control.usecase";
import type { PhoneOpening, Phones } from "../../usecase/phone.usecase";

// Le flux d'un téléphone, le même qu'il filme ou non et jamais rouvert pour cela : à tout téléphone l'état de la régie (OBS, viewers, live)
// sous le nom `control`, et un évènement nommé `keepalive` toutes les 5 s (`sendNamed`) : le téléphone tient le flux pour périmé quand il
// n'en reçoit plus rien. Tant que le téléphone filme (il a un numéro), son numéro, la page OBS de son numéro pour chaque sorte (image, mic)
// et leurs signaux (les téléphones), `air` (sa caméra est-elle à l'antenne, d'après les numéros que la régie dit à l'antenne), `mic` (son
// mic est-il celui du live, d'après les micros de la régie) et `picture` (est-il à l'image, et qui l'est, d'après l'image de la régie).
// Tout dans ce même flux : la page n'a pas de connexion de plus. Rend de quoi fermer le tout.
export function openPhoneStream(
  {
    phones,
    control,
  }: { phones: Pick<Phones, "openPhone">; control: Pick<Control, "getState" | "subscribe"> },
  opening: PhoneOpening,
  send: (event: PhoneEvent) => void,
  sendNamed: (event: string, payload: null) => void,
): () => void {
  // Le numéro du téléphone, appris des évènements que le serveur lui envoie (il le prend en filmant, le change, le rend), et ce que `air`,
  // `mic` et `picture` lui ont dit en dernier : un évènement ne part que quand sa valeur change, et repart de zéro à chaque Filmer.
  let number: number | null = null;
  let isOnAir: boolean | undefined;
  let isLiveMic: boolean | undefined;
  let standingText: string | undefined;
  const tellCamera = ({ onAir, mics, picture }: ControlState): void => {
    const nextOnAir = number !== null && onAir.includes(number);
    if (nextOnAir !== isOnAir) {
      isOnAir = nextOnAir;
      send({ kind: "air", isOnAir: nextOnAir });
    }
    const nextLiveMic = isLiveMicOf(mics, number);
    if (nextLiveMic !== isLiveMic) {
      isLiveMic = nextLiveMic;
      send({ kind: "mic", isLive: nextLiveMic });
    }
    const standing = toPictureStanding(picture, number);
    const nextStandingText = JSON.stringify(standing);
    if (nextStandingText !== standingText) {
      standingText = nextStandingText;
      send({ kind: "picture", standing });
    }
  };

  const closePhone = phones.openPhone(opening, (event) => {
    send(event);
    if (event.kind !== "number") return;
    number = event.number;
    if (number === null) {
      isOnAir = undefined;
      isLiveMic = undefined;
      standingText = undefined;
    } else tellCamera(control.getState());
  });
  send({ kind: "control", state: control.getState() });
  const stop = control.subscribe((state) => {
    if (number !== null) tellCamera(state);
    send({ kind: "control", state });
  });
  const keepalive = setInterval(() => sendNamed(PHONE_KEEPALIVE_EVENT, null), PHONE_KEEPALIVE_MS);
  return () => {
    clearInterval(keepalive);
    stop();
    closePhone();
  };
}
