import { type PictureState, PictureStateSchema } from "../../src/domain/picture.schema";
import type { FetchFn } from "./server-request";
import { SseFollower } from "./sse-follower";

const PICTURE_EVENTS_PATH = "/api/obs/picture/events";

// Ce que le plugin sait de l'image : rien encore, serveur injoignable, serveur d'avant la route ou message illisible, ou l'image.
export type PictureSnapshot =
  | { status: "pending" }
  | { status: "down" }
  | { status: "to-restart" }
  | { status: "ready"; picture: PictureState };

type Listener = (snapshot: PictureSnapshot) => void;

const toReason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// L'image du serveur (qui est à l'image dans la place caméra), partagée par toutes les touches « Image » visibles : un seul flux
// (`GET /api/obs/picture/events`) qui dit chaque changement tout de suite, d'où il vienne, ouvert avec la première touche visible et
// rouvert tout seul tant qu'il en reste une. Pas de relecture périodique : le flux redit l'image à chaque ouverture.
export class PictureFeed {
  readonly #visible = new Set<string>();
  readonly #listeners = new Set<Listener>();
  readonly #follower: SseFollower;
  readonly #log: (message: string) => void;
  #snapshot: PictureSnapshot = { status: "pending" };

  constructor(baseUrl: string, fetchFn: FetchFn = fetch, log: (message: string) => void = () => undefined) {
    this.#log = log;
    this.#follower = new SseFollower({
      url: `${baseUrl}${PICTURE_EVENTS_PATH}`,
      fetchFn,
      label: "Flux de l'image",
      onMessage: (data) => this.#onMessage(data),
      // Un serveur injoignable ou arrêté, ou qui n'a pas la route (il n'a pas été relancé) : la touche le dit, une seule fois par état.
      onEnd: ({ isRefused }) => this.#publishIfChanged({ status: isRefused ? "to-restart" : "down" }),
      isWanted: () => this.#visible.size > 0,
      log,
    });
  }

  get snapshot(): PictureSnapshot {
    return this.#snapshot;
  }

  onUpdate(listener: Listener): void {
    this.#listeners.add(listener);
  }

  // Une touche devient visible : le flux tourne tant qu'il en reste une.
  show(id: string): void {
    this.#visible.add(id);
    this.#follower.start();
  }

  // La dernière touche cachée ferme le flux ; l'image gardée serait périmée à la réapparition, elle repart de zéro.
  hide(id: string): void {
    this.#visible.delete(id);
    if (this.#visible.size > 0) return;
    this.#follower.stop();
    this.#snapshot = { status: "pending" };
  }

  // L'image du flux : un membre inconnu du plugin est écarté, un message illisible dit que le serveur n'est plus celui du plugin.
  #onMessage(data: string): void {
    try {
      const picture = PictureStateSchema.safeParse(JSON.parse(data));
      if (picture.success) {
        this.#publish({ status: "ready", picture: picture.data });
        return;
      }
    } catch (error) {
      this.#log(`Flux de l'image : message illisible (${toReason(error)}).`);
    }
    this.#publishIfChanged({ status: "to-restart" });
  }

  #publishIfChanged(snapshot: PictureSnapshot): void {
    if (snapshot.status !== this.#snapshot.status) this.#publish(snapshot);
  }

  #publish(snapshot: PictureSnapshot): void {
    this.#snapshot = snapshot;
    for (const listener of this.#listeners) listener(snapshot);
  }
}
