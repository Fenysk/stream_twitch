// Le côté téléphone de la mise en relation : quand il a une caméra et que la page OBS de son numéro est là, il envoie l'offre ; il la
// recommence quand la page change ou que la liaison tombe. `Stream` est le flux de la caméra (un MediaStream dans le navigateur).

import type { Candidate, Signal } from "../../domain/phone.schema";
import { createSignalGate, type PeerState, toErrorMessage } from "./peer-port";

// Une liaison en échec repart presque aussitôt ; une liaison « disconnected » peut revenir seule (le WiFi hoquette), on lui laisse 5 s.
export const FAILED_RESTART_MS = 1000;
export const DISCONNECTED_RESTART_MS = 5000;
export const OFFER_RETRY_MS = 2000;

export type LinkStatus = "waiting" | "connecting" | "connected";

export type SenderPeer<Stream> = {
  // Crée l'offre et la pose : le téléphone cherche alors ses candidats. Rend le texte de l'offre.
  offer(): Promise<string>;
  accept(description: string): Promise<void>;
  addCandidate(candidate: Candidate): Promise<void>;
  // La caméra change (l'autre objectif, une relance) : ses pistes remplacent celles qui partent, sans nouvelle mise en relation.
  replaceStream(stream: Stream): Promise<void>;
  close(): void;
};

export type SenderListener = { onCandidate(candidate: Candidate): void; onState(state: PeerState): void };

export type CameraSenderDeps<Stream> = {
  openPeer(stream: Stream, listener: SenderListener): SenderPeer<Stream>;
  send(signal: Signal): void;
  // Programme `callback` dans `ms` ; rend de quoi l'annuler.
  schedule(callback: () => void, ms: number): () => void;
  createId(): string;
  onStatus(status: LinkStatus): void;
  log(message: string): void;
};

export type CameraSender<Stream> = {
  // La caméra du téléphone ; `null` : elle est arrêtée.
  setStream(stream: Stream | null): void;
  // La page OBS du numéro de ce téléphone, ou `null` quand il n'y en a pas.
  setScreen(screenId: string | null): void;
  // Un signal de la page OBS.
  receive(signal: Signal): void;
  close(): void;
};

type Session<Stream> = {
  id: string;
  peer: SenderPeer<Stream>;
  // Les réponses et les candidats s'appliquent l'un après l'autre, dans l'ordre où ils arrivent.
  chain: Promise<void>;
  cancelWatch: (() => void) | null;
};

export function createCameraSender<Stream>({
  openPeer,
  send,
  schedule,
  createId,
  onStatus,
  log,
}: CameraSenderDeps<Stream>): CameraSender<Stream> {
  let stream: Stream | null = null;
  let screenId: string | null = null;
  let session: Session<Stream> | null = null;
  let cancelRestart: (() => void) | null = null;

  const end = (): void => {
    cancelRestart?.();
    cancelRestart = null;
    session?.cancelWatch?.();
    session?.peer.close();
    session = null;
  };

  const restart = (ms: number): void => {
    end();
    onStatus("connecting");
    cancelRestart = schedule(() => {
      cancelRestart = null;
      start();
    }, ms);
  };

  const watchState = (current: Session<Stream>, state: PeerState): void => {
    current.cancelWatch?.();
    current.cancelWatch = null;
    if (state === "connected") {
      onStatus("connected");
      return;
    }
    onStatus("connecting");
    if (state === "failed") restart(FAILED_RESTART_MS);
    else if (state === "disconnected")
      current.cancelWatch = schedule(() => restart(0), DISCONNECTED_RESTART_MS);
  };

  const start = (): void => {
    if (session || !stream || screenId === null) return;
    const id = createId();
    const gate = createSignalGate(send);
    const peer = openPeer(stream, {
      onCandidate: (candidate) => gate.push({ kind: "candidate", session: id, candidate }),
      onState: (state) => {
        if (session?.id === id) watchState(session, state);
      },
    });
    const current: Session<Stream> = { id, peer, chain: Promise.resolve(), cancelWatch: null };
    session = current;
    onStatus("connecting");
    current.chain = peer
      .offer()
      .then((description) => {
        if (session !== current) return;
        send({ kind: "offer", session: id, description });
        gate.open();
      })
      .catch((error: unknown) => {
        log(`Caméra : l'offre n'a pas pu partir (${toErrorMessage(error)}).`);
        if (session === current) restart(OFFER_RETRY_MS);
      });
  };

  return {
    setStream(next) {
      stream = next;
      if (next === null) {
        end();
        onStatus("waiting");
      } else if (session) {
        session.chain = session.chain
          .then(() => session?.peer.replaceStream(next))
          .catch((error: unknown) =>
            log(`Caméra : la nouvelle image n'est pas partie (${toErrorMessage(error)}).`),
          );
      } else start();
    },
    setScreen(next) {
      if (next === screenId) return;
      screenId = next;
      end();
      onStatus("waiting");
      start();
    },
    receive(signal) {
      const current = session;
      if (!current || signal.kind === "offer" || signal.session !== current.id) return;
      const apply = () =>
        signal.kind === "answer"
          ? current.peer.accept(signal.description)
          : current.peer.addCandidate(signal.candidate);
      current.chain = current.chain
        .then(apply)
        .catch((error: unknown) =>
          log(`Caméra : un signal de la page OBS a échoué (${toErrorMessage(error)}).`),
        );
    },
    close() {
      stream = null;
      screenId = null;
      end();
    },
  };
}
