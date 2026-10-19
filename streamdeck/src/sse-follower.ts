import type { FetchFn } from "./server-request";
import { createSseReader, MESSAGE_EVENT } from "./sse-events";

// Un flux coupé se rouvre après ce délai, tant qu'une touche est visible.
export const RECONNECT_MS = 2000;
// Le serveur qui accepte la connexion sans répondre : le flux l'abandonne, et réessaie au délai ci-dessus.
const CONNECT_TIMEOUT_MS = 3000;

// Comment un flux a fini : `wasStreaming` s'il avait déjà dit quelque chose, `isRefused` si le serveur a répondu autre chose qu'un flux
// (une route qu'il n'a pas encore : 404) plutôt que de ne pas répondre du tout.
export type SseEnd = { wasStreaming: boolean; isRefused: boolean };

type Finish = { reason: string; isRefused: boolean };

export type SseFollowerOptions = {
  url: string;
  fetchFn: FetchFn;
  // Le nom du flux dans le journal : « Flux des réglages ».
  label: string;
  // Chaque message sans nom, tel que le serveur l'a écrit ; les messages nommés (`keepalive`) ne disent rien.
  onMessage: (data: string) => void;
  // Le flux est fini : coupé par le serveur, refusé, injoignable. Le journal l'a dit s'il avait parlé ; à celui qui l'écoute de relire.
  onEnd: (end: SseEnd) => void;
  // Le flux se rouvre après une coupure tant que cela rend vrai (une touche est encore visible).
  isWanted: () => boolean;
  log: (message: string) => void;
};

const toReason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// Le Node 20 du Stream Deck n'a pas d'`EventSource` : un flux SSE du serveur se lit avec `fetch`, et se rouvre tout seul quand il est
// coupé. Un seul flux à la fois ; `start` l'ouvre, `stop` le ferme exprès.
export class SseFollower {
  readonly #options: SseFollowerOptions;
  // Le flux ouvert (ou en train de s'ouvrir), l'essai suivant quand il est coupé, et s'il a déjà dit quelque chose (il est « vivant »).
  #stream: AbortController | undefined;
  #reconnect: ReturnType<typeof setTimeout> | undefined;
  #isStreaming = false;

  constructor(options: SseFollowerOptions) {
    this.#options = options;
  }

  // Ouvre le flux, sauf s'il l'est déjà ou qu'un nouvel essai est programmé. Quelle que soit la fin du flux, `#onEnd` la traite.
  start(): void {
    if (this.#stream || this.#reconnect) return;
    const controller = new AbortController();
    this.#stream = controller;
    void this.#follow(controller).then((finish) => this.#onEnd(controller, finish));
  }

  stop(): void {
    clearTimeout(this.#reconnect);
    this.#reconnect = undefined;
    this.#stream?.abort();
    this.#stream = undefined;
    this.#isStreaming = false;
  }

  // Le flux est fini : coupé par le serveur, refusé, injoignable. Un flux qui avait parlé le dit au journal ; dans tous les cas celui qui
  // l'écoute est prévenu, et il se rouvre après `RECONNECT_MS`. Un flux fermé exprès (`stop`) n'est plus le flux courant : rien à faire.
  #onEnd(controller: AbortController, { reason, isRefused }: Finish): void {
    if (this.#stream !== controller) return;
    this.#stream = undefined;
    const wasStreaming = this.#isStreaming;
    if (wasStreaming) {
      this.#isStreaming = false;
      this.#options.log(
        `${this.#options.label} coupé (${reason}) : relecture, puis nouvel essai dans ${RECONNECT_MS / 1000} s.`,
      );
    }
    this.#options.onEnd({ wasStreaming, isRefused });
    this.#reconnect = setTimeout(() => {
      this.#reconnect = undefined;
      if (this.#options.isWanted()) this.start();
    }, RECONNECT_MS);
  }

  // Lit le flux jusqu'à sa fin et rend pourquoi il a fini. Le délai ne court que jusqu'à la réponse : le flux, lui, dure.
  async #follow(controller: AbortController): Promise<Finish> {
    const { url, fetchFn, label, onMessage, log } = this.#options;
    const waiting = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetchFn(url, { signal: controller.signal });
    } catch (error) {
      return { reason: toReason(error), isRefused: false };
    } finally {
      clearTimeout(waiting);
    }
    if (!response.ok || response.body === null) {
      return { reason: `réponse ${response.status}`, isRefused: true };
    }
    this.#isStreaming = true;
    log(`${label} ouvert.`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const read = createSseReader(({ name, data }) => {
      if (name === MESSAGE_EVENT) onMessage(data);
    });
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return { reason: "fermé par le serveur", isRefused: false };
        read(decoder.decode(value, { stream: true }));
      }
    } catch (error) {
      return { reason: toReason(error), isRefused: false };
    }
  }
}
