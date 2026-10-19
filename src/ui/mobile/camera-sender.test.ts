import { describe, expect, it } from "vitest";
import type { Candidate, Signal } from "../../domain/phone.schema";
import {
  createCameraSender,
  DISCONNECTED_RESTART_MS,
  FAILED_RESTART_MS,
  type LinkStatus,
  OFFER_RETRY_MS,
  type SenderListener,
  type SenderPeer,
} from "./camera-sender";

const CANDIDATE_A: Candidate = { candidate: "candidate:a", sdpMid: "0", sdpMLineIndex: 0 };
const CANDIDATE_B: Candidate = { candidate: "candidate:b", sdpMid: "0", sdpMLineIndex: 0 };

type FakePeer = SenderPeer<string> & { calls: string[]; listener: SenderListener };
type FakeTimer = { callback: () => void; ms: number; isCancelled: boolean };

// Le navigateur est remplacé par un faux « peer » qui note ce qu'on lui demande, et par des minuteurs que le test déclenche.
const setup = ({ failedOffers = 0 }: { failedOffers?: number } = {}) => {
  const sent: Signal[] = [];
  const statuses: LinkStatus[] = [];
  const logs: string[] = [];
  const peers: FakePeer[] = [];
  const timers: FakeTimer[] = [];
  let ids = 0;
  let offers = 0;
  const sender = createCameraSender<string>({
    openPeer(stream, listener) {
      const calls: string[] = [`ouvert avec ${stream}`];
      const peer: FakePeer = {
        calls,
        listener,
        offer: async () => {
          offers += 1;
          if (offers <= failedOffers) throw new Error("offre impossible");
          calls.push("offre");
          return `offre ${peers.length}`;
        },
        accept: async (description) => {
          calls.push(`réponse ${description}`);
        },
        addCandidate: async ({ candidate }) => {
          calls.push(`candidat ${candidate}`);
        },
        replaceStream: async (next) => {
          calls.push(`image ${next}`);
        },
        close: () => {
          calls.push("fermé");
        },
      };
      peers.push(peer);
      return peer;
    },
    send: (signal) => sent.push(signal),
    schedule: (callback, ms) => {
      const timer: FakeTimer = { callback, ms, isCancelled: false };
      timers.push(timer);
      return () => {
        timer.isCancelled = true;
      };
    },
    createId: () => {
      ids += 1;
      return `session-000${ids}`;
    },
    onStatus: (status) => statuses.push(status),
    log: (line) => logs.push(line),
  });
  const peerAt = (index: number): FakePeer => {
    const peer = peers[index];
    if (!peer) throw new Error(`pas de peer n° ${index}`);
    return peer;
  };
  // Les promesses du faux peer se règlent avant la suite du test.
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  // Déclenche les minuteurs encore armés, dans l'ordre où ils ont été programmés.
  const runTimers = async () => {
    for (const timer of timers.splice(0)) if (!timer.isCancelled) timer.callback();
    await settle();
  };
  return { sender, sent, statuses, logs, peers, peerAt, timers, settle, runTimers };
};

const OFFER_1: Signal = { kind: "offer", session: "session-0001", description: "offre 1" };

describe("L'offre du téléphone", () => {
  it("Quand la caméra et la page OBS sont là, le système doit envoyer l'offre d'une nouvelle session", async () => {
    const { sender, sent, statuses, settle } = setup();
    sender.setStream("caméra");
    sender.setScreen("screen-0001");
    await settle();
    expect(sent).toEqual([OFFER_1]);
    expect(statuses.at(-1)).toBe("connecting");
  });

  it("n'envoie rien tant que la caméra ou la page OBS manque, puis l'offre dès que les deux sont là", async () => {
    const { sender, sent, peers, statuses, settle } = setup();
    sender.setScreen("screen-0001");
    await settle();
    expect(peers).toHaveLength(0);
    expect(statuses.at(-1)).toBe("waiting");
    sender.setStream("caméra");
    await settle();
    expect(sent).toEqual([OFFER_1]);
  });

  it("garde les candidats derrière l'offre, dans l'ordre, puis envoie les suivants tout de suite", async () => {
    const { sender, sent, peerAt, settle } = setup();
    sender.setStream("caméra");
    sender.setScreen("screen-0001");
    peerAt(0).listener.onCandidate(CANDIDATE_A);
    await settle();
    peerAt(0).listener.onCandidate(CANDIDATE_B);
    expect(sent).toEqual([
      OFFER_1,
      { kind: "candidate", session: "session-0001", candidate: CANDIDATE_A },
      { kind: "candidate", session: "session-0001", candidate: CANDIDATE_B },
    ]);
  });

  it("Quand l'offre ne peut pas être créée, le système doit le journaliser et recommencer après 2 s", async () => {
    const { sender, sent, logs, timers, runTimers, settle } = setup({ failedOffers: 1 });
    sender.setStream("caméra");
    sender.setScreen("screen-0001");
    await settle();
    expect(sent).toEqual([]);
    expect(logs).toEqual(["Caméra : l'offre n'a pas pu partir (offre impossible)."]);
    expect(timers.map(({ ms }) => ms)).toEqual([OFFER_RETRY_MS]);
    await runTimers();
    expect(sent).toEqual([{ kind: "offer", session: "session-0002", description: "offre 2" }]);
  });
});

describe("Les signaux de la page OBS", () => {
  it("applique la réponse puis les candidats de la session, dans l'ordre", async () => {
    const { sender, peerAt, settle } = setup();
    sender.setStream("caméra");
    sender.setScreen("screen-0001");
    await settle();
    sender.receive({ kind: "answer", session: "session-0001", description: "réponse" });
    sender.receive({ kind: "candidate", session: "session-0001", candidate: CANDIDATE_A });
    await settle();
    expect(peerAt(0).calls.slice(-2)).toEqual(["réponse réponse", "candidat candidate:a"]);
  });

  it("ignore un signal d'une autre session, une offre, et tout signal sans session", async () => {
    const { sender, peerAt, settle } = setup();
    sender.receive({ kind: "answer", session: "session-0001", description: "trop tôt" });
    sender.setStream("caméra");
    sender.setScreen("screen-0001");
    await settle();
    sender.receive({ kind: "answer", session: "session-9999", description: "vieille réponse" });
    sender.receive(OFFER_1);
    await settle();
    expect(peerAt(0).calls).toEqual(["ouvert avec caméra", "offre"]);
  });
});

describe("Quand la page OBS ou la caméra change", () => {
  it("Si la page OBS est une autre, le système doit fermer la liaison et envoyer une nouvelle offre", async () => {
    const { sender, sent, peers, peerAt, settle } = setup();
    sender.setStream("caméra");
    sender.setScreen("screen-0001");
    await settle();
    sender.setScreen("screen-0002");
    await settle();
    expect(peerAt(0).calls.at(-1)).toBe("fermé");
    expect(peers).toHaveLength(2);
    expect(sent.at(-1)).toEqual({ kind: "offer", session: "session-0002", description: "offre 2" });
  });

  it("ne recommence rien quand le serveur redit la même page OBS", async () => {
    const { sender, peers, settle } = setup();
    sender.setStream("caméra");
    sender.setScreen("screen-0001");
    await settle();
    sender.setScreen("screen-0001");
    await settle();
    expect(peers).toHaveLength(1);
  });

  it("Quand la page OBS part, le système doit fermer la liaison et attendre", async () => {
    const { sender, statuses, peerAt, settle } = setup();
    sender.setStream("caméra");
    sender.setScreen("screen-0001");
    await settle();
    sender.setScreen(null);
    expect(peerAt(0).calls.at(-1)).toBe("fermé");
    expect(statuses.at(-1)).toBe("waiting");
  });

  it("Quand la caméra change (l'autre objectif), le système doit remplacer l'image sans nouvelle offre", async () => {
    const { sender, peers, peerAt, settle } = setup();
    sender.setStream("arrière");
    sender.setScreen("screen-0001");
    await settle();
    sender.setStream("avant");
    await settle();
    expect(peers).toHaveLength(1);
    expect(peerAt(0).calls.at(-1)).toBe("image avant");
  });

  it("Quand la caméra s'arrête, le système doit fermer la liaison ; quand elle revient, envoyer une nouvelle offre", async () => {
    const { sender, sent, statuses, peerAt, settle } = setup();
    sender.setStream("caméra");
    sender.setScreen("screen-0001");
    await settle();
    sender.setStream(null);
    expect(peerAt(0).calls.at(-1)).toBe("fermé");
    expect(statuses.at(-1)).toBe("waiting");
    sender.setStream("caméra");
    await settle();
    expect(sent.at(-1)).toEqual({ kind: "offer", session: "session-0002", description: "offre 2" });
  });
});

describe("La liaison qui tombe", () => {
  it("dit connectée quand la liaison s'établit", async () => {
    const { sender, statuses, peerAt, settle } = setup();
    sender.setStream("caméra");
    sender.setScreen("screen-0001");
    await settle();
    peerAt(0).listener.onState("connected");
    expect(statuses.at(-1)).toBe("connected");
  });

  it("Si la liaison échoue, le système doit la recommencer après 1 s", async () => {
    const { sender, sent, peers, peerAt, timers, runTimers, settle } = setup();
    sender.setStream("caméra");
    sender.setScreen("screen-0001");
    await settle();
    peerAt(0).listener.onState("failed");
    expect(peerAt(0).calls.at(-1)).toBe("fermé");
    expect(timers.map(({ ms }) => ms)).toEqual([FAILED_RESTART_MS]);
    await runTimers();
    expect(peers).toHaveLength(2);
    expect(sent.at(-1)).toEqual({ kind: "offer", session: "session-0002", description: "offre 2" });
  });

  it("Si la liaison se coupe plus de 5 s, alors le système doit la recommencer", async () => {
    const { sender, peers, peerAt, timers, runTimers, settle } = setup();
    sender.setStream("caméra");
    sender.setScreen("screen-0001");
    await settle();
    peerAt(0).listener.onState("disconnected");
    expect(timers.map(({ ms }) => ms)).toEqual([DISCONNECTED_RESTART_MS]);
    await runTimers();
    await runTimers();
    expect(peers).toHaveLength(2);
  });

  it("ne recommence rien si la liaison revient avant les 5 s", async () => {
    const { sender, peers, peerAt, runTimers, settle } = setup();
    sender.setStream("caméra");
    sender.setScreen("screen-0001");
    await settle();
    peerAt(0).listener.onState("disconnected");
    peerAt(0).listener.onState("connected");
    await runTimers();
    expect(peers).toHaveLength(1);
  });

  it("ignore l'état d'une liaison déjà fermée", async () => {
    const { sender, peers, peerAt, runTimers, settle } = setup();
    sender.setStream("caméra");
    sender.setScreen("screen-0001");
    await settle();
    sender.setScreen("screen-0002");
    await settle();
    peerAt(0).listener.onState("failed");
    await runTimers();
    expect(peers).toHaveLength(2);
  });

  it("Quand on ferme le téléphone, le système doit fermer la liaison et annuler la relance prévue", async () => {
    const { sender, peers, peerAt, runTimers, settle } = setup();
    sender.setStream("caméra");
    sender.setScreen("screen-0001");
    await settle();
    peerAt(0).listener.onState("failed");
    sender.close();
    await runTimers();
    expect(peers).toHaveLength(1);
    expect(peerAt(0).calls.at(-1)).toBe("fermé");
  });
});
