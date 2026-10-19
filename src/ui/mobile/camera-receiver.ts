// Le côté page OBS de la mise en relation : elle répond à l'offre de son téléphone et montre son flux ; elle lâche tout quand le
// téléphone part. `Stream` est le flux reçu (un MediaStream dans le navigateur).

import type { Candidate, Signal } from "../../domain/phone.schema";
import { createSignalGate, type PeerState, toErrorMessage } from "./peer-port";

export type ReceiverPeer = {
  // Pose l'offre, crée la réponse et la pose. Rend le texte de la réponse.
  answer(offer: string): Promise<string>;
  addCandidate(candidate: Candidate): Promise<void>;
  close(): void;
};

export type ReceiverListener<Stream> = {
  onCandidate(candidate: Candidate): void;
  onStream(stream: Stream): void;
  onState(state: PeerState): void;
};

export type CameraReceiverDeps<Stream> = {
  openPeer(listener: ReceiverListener<Stream>): ReceiverPeer;
  send(signal: Signal): void;
  // Le flux à montrer ; `null` : plus rien à montrer.
  onStream(stream: Stream | null): void;
  // La liaison avec le téléphone est vive (`true`, tant que la mise en relation WebRTC est établie) ou ne l'est plus (`false`, dès qu'elle
  // passe par « disconnected », échoue ou se ferme) : la page le dit au serveur, qui n'offre l'image de cette caméra que si elle l'est.
  onLink(isLinked: boolean): void;
  log(message: string): void;
};

export type CameraReceiver = {
  // Le serveur dit si le téléphone de cette page est là ; parti, la page ne montre plus rien.
  setPhonePresent(isPresent: boolean): void;
  // Un signal du téléphone.
  receive(signal: Signal): void;
  close(): void;
};

type Session = {
  id: string;
  peer: ReceiverPeer;
  // La réponse part avant les candidats, qui s'ajoutent l'un après l'autre dans l'ordre où ils arrivent.
  chain: Promise<void>;
};

export function createCameraReceiver<Stream>({
  openPeer,
  send,
  onStream,
  onLink,
  log,
}: CameraReceiverDeps<Stream>): CameraReceiver {
  let session: Session | null = null;
  // Ce que la page a dit en dernier de sa liaison : elle ne le redit que s'il change.
  let isLinked = false;

  const link = (next: boolean): void => {
    if (next === isLinked) return;
    isLinked = next;
    onLink(next);
  };

  const end = (): void => {
    if (!session) return;
    session.peer.close();
    session = null;
    link(false);
    onStream(null);
  };

  const answer = (id: string, description: string): void => {
    const gate = createSignalGate(send);
    const peer = openPeer({
      onCandidate: (candidate) => gate.push({ kind: "candidate", session: id, candidate }),
      onStream: (stream) => {
        if (session?.id === id) onStream(stream);
      },
      onState: (state) => {
        if (session?.id !== id) return;
        link(state === "connected");
        if (state === "failed") end();
      },
    });
    const current: Session = { id, peer, chain: Promise.resolve() };
    session = current;
    current.chain = peer
      .answer(description)
      .then((reply) => {
        if (session !== current) return;
        send({ kind: "answer", session: id, description: reply });
        gate.open();
      })
      .catch((error: unknown) => log(`Caméra : l'offre du téléphone a échoué (${toErrorMessage(error)}).`));
  };

  return {
    setPhonePresent(isPresent) {
      if (!isPresent) end();
    },
    receive(signal) {
      if (signal.kind === "offer") {
        end();
        answer(signal.session, signal.description);
        return;
      }
      const current = session;
      if (!current || signal.kind !== "candidate" || signal.session !== current.id) return;
      current.chain = current.chain
        .then(() => current.peer.addCandidate(signal.candidate))
        .catch((error: unknown) =>
          log(`Caméra : un candidat du téléphone a échoué (${toErrorMessage(error)}).`),
        );
    },
    close: end,
  };
}
