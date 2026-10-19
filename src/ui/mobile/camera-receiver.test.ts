import { describe, expect, it } from "vitest";
import type { Candidate, Signal } from "../../domain/phone.schema";
import { createCameraReceiver, type ReceiverListener, type ReceiverPeer } from "./camera-receiver";

const CANDIDATE_A: Candidate = { candidate: "candidate:a", sdpMid: "0", sdpMLineIndex: 0 };
const OFFER: Signal = { kind: "offer", session: "session-0001", description: "offre du téléphone" };

type FakePeer = ReceiverPeer & { calls: string[]; listener: ReceiverListener<string> };

// Le navigateur est remplacé par un faux « peer » qui note ce qu'on lui demande.
const setup = ({ isAnswerBroken = false }: { isAnswerBroken?: boolean } = {}) => {
  const sent: Signal[] = [];
  const shown: (string | null)[] = [];
  // Ce que la page a dit de sa liaison, dans l'ordre : « vive » ou « perdue ».
  const links: string[] = [];
  const logs: string[] = [];
  const peers: FakePeer[] = [];
  const receiver = createCameraReceiver<string>({
    openPeer(listener) {
      const calls: string[] = [];
      const peer: FakePeer = {
        calls,
        listener,
        answer: async (offer) => {
          if (isAnswerBroken) throw new Error("offre illisible");
          calls.push(`offre ${offer}`);
          return "réponse de la page";
        },
        addCandidate: async ({ candidate }) => {
          calls.push(`candidat ${candidate}`);
        },
        close: () => {
          calls.push("fermé");
        },
      };
      peers.push(peer);
      return peer;
    },
    send: (signal) => sent.push(signal),
    onStream: (stream) => shown.push(stream),
    onLink: (isLinked) => links.push(isLinked ? "vive" : "perdue"),
    log: (line) => logs.push(line),
  });
  const peerAt = (index: number): FakePeer => {
    const peer = peers[index];
    if (!peer) throw new Error(`pas de peer n° ${index}`);
    return peer;
  };
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  return { receiver, sent, shown, links, logs, peers, peerAt, settle };
};

describe("La réponse de la page OBS", () => {
  it("Quand l'offre du téléphone arrive, le système doit répondre dans la même session", async () => {
    const { receiver, sent, peerAt, settle } = setup();
    receiver.receive(OFFER);
    await settle();
    expect(peerAt(0).calls).toEqual(["offre offre du téléphone"]);
    expect(sent).toEqual([{ kind: "answer", session: "session-0001", description: "réponse de la page" }]);
  });

  it("garde ses candidats derrière la réponse, puis envoie les suivants tout de suite", async () => {
    const { receiver, sent, peerAt, settle } = setup();
    receiver.receive(OFFER);
    peerAt(0).listener.onCandidate(CANDIDATE_A);
    await settle();
    peerAt(0).listener.onCandidate(CANDIDATE_A);
    expect(sent.map(({ kind }) => kind)).toEqual(["answer", "candidate", "candidate"]);
    expect(sent[1]).toEqual({ kind: "candidate", session: "session-0001", candidate: CANDIDATE_A });
  });

  it("ajoute les candidats du téléphone après l'offre, dans l'ordre", async () => {
    const { receiver, peerAt, settle } = setup();
    receiver.receive(OFFER);
    receiver.receive({ kind: "candidate", session: "session-0001", candidate: CANDIDATE_A });
    await settle();
    expect(peerAt(0).calls).toEqual(["offre offre du téléphone", "candidat candidate:a"]);
  });

  it("ignore un candidat d'une autre session, une réponse, et un candidat sans offre", async () => {
    const { receiver, peers, peerAt, settle } = setup();
    receiver.receive({ kind: "candidate", session: "session-0001", candidate: CANDIDATE_A });
    expect(peers).toHaveLength(0);
    receiver.receive(OFFER);
    receiver.receive({ kind: "candidate", session: "session-9999", candidate: CANDIDATE_A });
    receiver.receive({ kind: "answer", session: "session-0001", description: "x" });
    await settle();
    expect(peerAt(0).calls).toEqual(["offre offre du téléphone"]);
  });

  it("Si l'offre est illisible, alors le système doit le journaliser et ne rien répondre", async () => {
    const { receiver, sent, logs, settle } = setup({ isAnswerBroken: true });
    receiver.receive(OFFER);
    await settle();
    expect(sent).toEqual([]);
    expect(logs).toEqual(["Caméra : l'offre du téléphone a échoué (offre illisible)."]);
  });
});

describe("L'image de la page OBS", () => {
  it("montre le flux reçu de la session en cours", async () => {
    const { receiver, shown, peerAt, settle } = setup();
    receiver.receive(OFFER);
    await settle();
    peerAt(0).listener.onStream("image du téléphone");
    expect(shown).toEqual(["image du téléphone"]);
  });

  it("Quand le téléphone part, le système doit fermer la liaison et ne plus rien montrer", async () => {
    const { receiver, shown, peerAt, settle } = setup();
    receiver.receive(OFFER);
    await settle();
    receiver.setPhonePresent(false);
    expect(peerAt(0).calls.at(-1)).toBe("fermé");
    expect(shown).toEqual([null]);
  });

  it("attend l'offre quand le téléphone arrive, sans rien changer à ce qui est montré", () => {
    const { receiver, peers, shown } = setup();
    receiver.setPhonePresent(true);
    expect(peers).toHaveLength(0);
    expect(shown).toEqual([]);
  });

  it("Quand une nouvelle offre arrive, le système doit fermer l'ancienne liaison et ignorer ses flux", async () => {
    const { receiver, shown, peers, peerAt, settle } = setup();
    receiver.receive(OFFER);
    await settle();
    receiver.receive({ ...OFFER, session: "session-0002" });
    await settle();
    expect(peers).toHaveLength(2);
    expect(peerAt(0).calls.at(-1)).toBe("fermé");
    peerAt(0).listener.onStream("image périmée");
    peerAt(1).listener.onStream("image neuve");
    expect(shown).toEqual([null, "image neuve"]);
  });

  it("Si la liaison échoue, alors le système doit la fermer et ne plus rien montrer", async () => {
    const { receiver, shown, peerAt, settle } = setup();
    receiver.receive(OFFER);
    await settle();
    peerAt(0).listener.onState("failed");
    expect(peerAt(0).calls.at(-1)).toBe("fermé");
    expect(shown).toEqual([null]);
  });

  it("garde la liaison quand elle passe par « disconnected » : elle peut revenir seule", async () => {
    const { receiver, shown, peerAt, settle } = setup();
    receiver.receive(OFFER);
    await settle();
    peerAt(0).listener.onState("disconnected");
    expect(shown).toEqual([]);
  });

  it("ferme la liaison quand la page se ferme", async () => {
    const { receiver, peerAt, settle } = setup();
    receiver.receive(OFFER);
    await settle();
    receiver.close();
    expect(peerAt(0).calls.at(-1)).toBe("fermé");
  });
});

describe("La liaison vive de la page OBS", () => {
  it("ne dit rien tant que la mise en relation n'est pas établie", async () => {
    const { receiver, links, peerAt, settle } = setup();
    receiver.receive(OFFER);
    await settle();
    peerAt(0).listener.onState("connecting");
    expect(links).toEqual([]);
  });

  it("dit la liaison vive quand elle s'établit, puis la perd dès qu'elle passe par « disconnected », sans fermer la session", async () => {
    const { receiver, links, shown, peerAt, settle } = setup();
    receiver.receive(OFFER);
    await settle();
    peerAt(0).listener.onState("connected");
    peerAt(0).listener.onState("disconnected");
    peerAt(0).listener.onState("connected");
    expect(links).toEqual(["vive", "perdue", "vive"]);
    expect(shown).toEqual([]);
  });

  it("ne redit pas ce qu'elle a déjà dit", async () => {
    const { receiver, links, peerAt, settle } = setup();
    receiver.receive(OFFER);
    await settle();
    peerAt(0).listener.onState("connected");
    peerAt(0).listener.onState("connected");
    expect(links).toEqual(["vive"]);
  });

  it("la perd une seule fois quand la liaison échoue : « failed » la ferme, la fermeture ne le redit pas", async () => {
    const { receiver, links, peerAt, settle } = setup();
    receiver.receive(OFFER);
    await settle();
    peerAt(0).listener.onState("connected");
    peerAt(0).listener.onState("failed");
    expect(links).toEqual(["vive", "perdue"]);
  });

  it("la perd quand le téléphone part ou que la page se ferme", async () => {
    const first = setup();
    first.receiver.receive(OFFER);
    await first.settle();
    first.peerAt(0).listener.onState("connected");
    first.receiver.setPhonePresent(false);
    expect(first.links).toEqual(["vive", "perdue"]);
    const second = setup();
    second.receiver.receive(OFFER);
    await second.settle();
    second.peerAt(0).listener.onState("connected");
    second.receiver.close();
    expect(second.links).toEqual(["vive", "perdue"]);
  });

  it("la perd quand une nouvelle offre remplace la session, puis la retrouve avec la nouvelle", async () => {
    const { receiver, links, peerAt, settle } = setup();
    receiver.receive(OFFER);
    await settle();
    peerAt(0).listener.onState("connected");
    receiver.receive({ ...OFFER, session: "session-0002" });
    await settle();
    peerAt(1).listener.onState("connected");
    expect(links).toEqual(["vive", "perdue", "vive"]);
  });

  it("ignore l'état d'une session périmée : son « connected » ne rend pas la liaison vive", async () => {
    const { receiver, links, peerAt, settle } = setup();
    receiver.receive(OFFER);
    await settle();
    receiver.receive({ ...OFFER, session: "session-0002" });
    await settle();
    peerAt(0).listener.onState("connected");
    expect(links).toEqual([]);
  });

  it("ne dit rien quand le téléphone part sans qu'il y ait eu de liaison", () => {
    const { receiver, links } = setup();
    receiver.setPhonePresent(false);
    receiver.close();
    expect(links).toEqual([]);
  });
});
