import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toEventStream } from "./event-stream";

// Ce qui part sur le fil, jusqu'à ce que `open` ait tout envoyé : le flux ne se ferme pas, on lit les morceaux déjà prêts.
const getChunks = async (response: Response, count: number): Promise<string[]> => {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("flux sans corps");
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const { value } = await reader.read();
    chunks.push(decoder.decode(value));
  }
  await reader.cancel();
  return chunks;
};

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("toEventStream", () => {
  it("envoie chaque payload en `data:`, sans nom d'évènement, après le délai de reconnexion", async () => {
    const response = toEventStream<{ id: number }>("", (send) => {
      send({ id: 1 });
      send({ id: 2 });
      return () => undefined;
    });
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(await getChunks(response, 3)).toEqual([
      "retry: 1000\n\n",
      'data: {"id":1}\n\n',
      'data: {"id":2}\n\n',
    ]);
  });

  it("Quand `open` envoie sous un nom, le système doit écrire `event:` avant `data:`, dans l'ordre d'envoi", async () => {
    const response = toEventStream<{ id: number }, { head: string }>("", (send, sendNamed) => {
      send({ id: 1 });
      sendNamed("head", { head: "a" });
      send({ id: 2 });
      return () => undefined;
    });
    expect(await getChunks(response, 4)).toEqual([
      "retry: 1000\n\n",
      'data: {"id":1}\n\n',
      'event: head\ndata: {"head":"a"}\n\n',
      'data: {"id":2}\n\n',
    ]);
  });

  it("se désabonne quand la page se déconnecte", async () => {
    const unsubscribe = vi.fn();
    const response = toEventStream<number>("", () => unsubscribe);
    await getChunks(response, 1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
