import type { HeadView } from "../../domain/head.types";
import { SHOW_HEAD_EVENT, type ShowState } from "../../domain/show.schema";
import type { HeadFeed } from "../../usecase/head.usecase";
import type { ShowDirector } from "../../usecase/show-director.usecase";

export type ShowStreamDeps = {
  director: Pick<ShowDirector, "getState" | "subscribe" | "openPage">;
  feed: Pick<HeadFeed, "getView" | "subscribe">;
};

// Ce qu'une connexion au flux de l'émission reçoit : l'état à la connexion puis à chaque changement, en messages sans nom. La page
// `/show` (`isPage`) est comptée, et reçoit en plus la vue de la tête sous le nom `head`, à la connexion puis à chaque changement :
// la même connexion, jamais un flux de plus (OBS n'a que 6 connexions par hôte). Rend de quoi tout fermer.
export function openShowStream(
  { director, feed }: ShowStreamDeps,
  isPage: boolean,
  send: (state: ShowState) => void,
  sendNamed: (event: string, view: HeadView) => void,
): () => void {
  const closePage = isPage ? director.openPage() : () => undefined;
  send(director.getState());
  const unsubscribe = director.subscribe(send);
  const sendHead = (view: HeadView) => sendNamed(SHOW_HEAD_EVENT, view);
  if (isPage) sendHead(feed.getView());
  const unsubscribeHead = isPage ? feed.subscribe(sendHead) : () => undefined;
  return () => {
    unsubscribeHead();
    unsubscribe();
    closePage();
  };
}
