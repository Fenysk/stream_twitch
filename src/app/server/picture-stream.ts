import type { PictureState } from "../../domain/picture.schema";
import type { Control } from "../../usecase/control.usecase";

// Le nom de l'évènement qui garde le flux ouvert : sans rien à dire pendant 5 minutes, le `fetch` de Node 20 (le plugin Stream Deck) le
// croit mort et le coupe. Il ne porte rien : le plugin ne lit que les messages sans nom.
export const PICTURE_KEEPALIVE_EVENT = "keepalive";
export const PICTURE_KEEPALIVE_MS = 30_000;

// Ce qu'une connexion au flux de l'image reçoit : l'image (membres de la place caméra et celui qui est affiché) à la connexion puis à chaque
// changement, d'où il vienne (le bandeau, un téléphone, OBS à la main, le repli), en messages sans nom ; la régie redit tout son état à
// chaque changement, l'image n'est envoyée que si elle a changé ; et un message `keepalive` régulier. Rend de quoi tout fermer.
export function openPictureStream(
  { control }: { control: Pick<Control, "getState" | "subscribe"> },
  send: (picture: PictureState) => void,
  sendNamed: (event: string, payload: null) => void,
): () => void {
  let last = JSON.stringify(control.getState().picture);
  send(control.getState().picture);
  const unsubscribe = control.subscribe(({ picture }) => {
    const next = JSON.stringify(picture);
    if (next === last) return;
    last = next;
    send(picture);
  });
  const keepalive = setInterval(() => sendNamed(PICTURE_KEEPALIVE_EVENT, null), PICTURE_KEEPALIVE_MS);
  return () => {
    clearInterval(keepalive);
    unsubscribe();
  };
}
