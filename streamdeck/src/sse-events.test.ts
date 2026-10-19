import { describe, expect, it } from "vitest";
import { createSseReader, MESSAGE_EVENT, type SseEvent } from "./sse-events";

const readerOf = () => {
  const events: SseEvent[] = [];
  return { events, read: createSseReader((event) => events.push(event)) };
};

describe("createSseReader", () => {
  it("rend un message sans nom quand l'évènement n'a que des données", () => {
    const { events, read } = readerOf();
    read('data: {"a":1}\n\n');
    expect(events).toEqual([{ name: MESSAGE_EVENT, data: '{"a":1}' }]);
  });

  it("rend le nom de l'évènement quand il en a un", () => {
    const { events, read } = readerOf();
    read("event: ping\ndata: null\n\n");
    expect(events).toEqual([{ name: "ping", data: "null" }]);
  });

  it("garde l'ordre de plusieurs évènements arrivés ensemble", () => {
    const { events, read } = readerOf();
    read("data: un\n\ndata: deux\n\nevent: ping\ndata: trois\n\n");
    expect(events.map(({ name, data }) => [name, data])).toEqual([
      [MESSAGE_EVENT, "un"],
      [MESSAGE_EVENT, "deux"],
      ["ping", "trois"],
    ]);
  });

  it("n'attend pas la fin de l'évènement pour lire ce qui est complet, mais ne donne rien tant que la ligne vide manque", () => {
    const { events, read } = readerOf();
    read("data: un\n");
    expect(events).toEqual([]);
    read("\n");
    expect(events).toEqual([{ name: MESSAGE_EVENT, data: "un" }]);
  });

  it("recolle un évènement coupé n'importe où : au milieu d'un mot, entre `data:` et sa valeur, avant la ligne vide", () => {
    const { events, read } = readerOf();
    for (const piece of ["da", "ta:", " héll", "o wor", "ld\n", "\nev", "ent: pi", "ng\ndata: x\n", "\n"])
      read(piece);
    expect(events).toEqual([
      { name: MESSAGE_EVENT, data: "héllo world" },
      { name: "ping", data: "x" },
    ]);
  });

  it("joint par un saut de ligne les lignes `data:` d'un même évènement", () => {
    const { events, read } = readerOf();
    read("data: ligne 1\ndata: ligne 2\n\n");
    expect(events).toEqual([{ name: MESSAGE_EVENT, data: "ligne 1\nligne 2" }]);
  });

  it("ne retire qu'une espace après les deux-points, et accepte une valeur collée", () => {
    const { events, read } = readerOf();
    read("data:collé\n\ndata:   trois\n\n");
    expect(events.map(({ data }) => data)).toEqual(["collé", "  trois"]);
  });

  it("laisse de côté les commentaires, `retry:` et les champs qu'il ne lit pas, et un évènement sans données", () => {
    const { events, read } = readerOf();
    read("retry: 1000\n\n: un commentaire\nid: 7\n\nevent: seul\n\ndata: vrai\n\n");
    expect(events).toEqual([{ name: MESSAGE_EVENT, data: "vrai" }]);
  });

  it("n'applique pas le nom d'un évènement sans données à celui qui le suit", () => {
    const { events, read } = readerOf();
    read("event: seul\n\ndata: suite\n\n");
    expect(events).toEqual([{ name: MESSAGE_EVENT, data: "suite" }]);
  });

  it("accepte les fins de ligne \\r\\n et \\r", () => {
    const { events, read } = readerOf();
    read("data: a\r\n\r\ndata: b\r\r");
    expect(events.map(({ data }) => data)).toEqual(["a", "b"]);
  });

  it("garde un champ sans deux-points comme un champ vide : `data` seul est une donnée vide", () => {
    const { events, read } = readerOf();
    read("data\n\n");
    expect(events).toEqual([{ name: MESSAGE_EVENT, data: "" }]);
  });
});
