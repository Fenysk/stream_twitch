import { defineHandler } from "nitro";
import { getRuntime } from "./runtime";

// ~15 images par seconde : OBS mesure toutes les 50 ms, le flux garde le pic de chaque image (un pic de voix ne se perd pas).
const SEND_MS = 66;
const SILENCE = -100;

// Flux SSE du vumètre : le level du micro en dB, et si OBS est joint.
export default defineHandler(() => {
  const { obs } = getRuntime();
  const encoder = new TextEncoder();
  let stop: (() => void) | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string) => controller.enqueue(encoder.encode(text));
      let peak = SILENCE;
      send("retry: 1000\n\n");
      const unsubscribe = obs.mic.subscribe((level) => {
        peak = Math.max(peak, level);
      });
      const timer = setInterval(() => {
        const status = obs.getStatus();
        send(`data: ${JSON.stringify({ level: Number(peak.toFixed(1)), isLinked: status.isLinked })}\n\n`);
        peak = SILENCE;
      }, SEND_MS);
      stop = () => {
        clearInterval(timer);
        unsubscribe();
      };
    },
    cancel() {
      stop?.();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform" },
  });
});
