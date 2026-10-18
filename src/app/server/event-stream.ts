import { log } from "./server-log";

const openPages = new Map<string, number>();

// Un flux SSE (la tête, le tchat, le renard : trois pages OBS, un seul format). `open` envoie l'état de départ, s'abonne et
// rend le désabonnement ; chaque évènement envoyé part en `data:`. `sendNamed` envoie sous un nom d'évènement (`event:`) : une page
// qui n'écoute que les messages sans nom (`onmessage`) ne le reçoit pas. `label` nomme les pages dans le journal : « Page du tchat
// connectée (2 ouvertes). » ; vide, « Page connectée ».
export function toEventStream<Payload, Named = never>(
  label: string,
  open: (send: (payload: Payload) => void, sendNamed: (event: string, payload: Named) => void) => () => void,
): Response {
  const encoder = new TextEncoder();
  const name = ["Page", label].filter(Boolean).join(" ");
  const count = (change: number): string => {
    const next = (openPages.get(label) ?? 0) + change;
    openPages.set(label, next);
    return `${next} ouverte${next > 1 ? "s" : ""}`;
  };
  let unsubscribe: (() => void) | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: Payload) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      const sendNamed = (event: string, payload: Named) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
      controller.enqueue(encoder.encode("retry: 1000\n\n"));
      unsubscribe = open(send, sendNamed);
      log(`${name} connectée (${count(1)}).`);
    },
    cancel() {
      unsubscribe?.();
      log(`${name} déconnectée (${count(-1)}).`);
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform" },
  });
}
