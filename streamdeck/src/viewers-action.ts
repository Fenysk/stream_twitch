import streamDeck, { SingletonAction } from "@elgato/streamdeck";
import { readViewersTitle } from "./viewers-title";

export const VIEWERS_ACTION_UUID = "com.fenysk.stream-twitch.viewers";
const REFRESH_PERIOD_MS = 10_000;

// La touche « Viewers » : toutes les touches visibles montrent le même titre, relu par un seul minuteur.
export class ViewersAction extends SingletonAction {
  // Un champ plutôt que le décorateur @action : le bundle n'a aucune transformation de décorateurs à faire.
  override readonly manifestId = VIEWERS_ACTION_UUID;
  readonly #url: string;
  #timer: ReturnType<typeof setInterval> | undefined;
  #isReading = false;

  constructor(url: string) {
    super();
    this.#url = url;
  }

  override onWillAppear(): void {
    void this.#refresh();
    this.#timer ??= setInterval(() => void this.#refresh(), REFRESH_PERIOD_MS);
  }

  // Le SDK retire l'action du magasin avant d'appeler cette méthode : plus rien dans `actions`, plus de minuteur.
  override onWillDisappear(): void {
    if (!this.actions.next().done) return;
    clearInterval(this.#timer);
    this.#timer = undefined;
  }

  override onKeyDown(): void {
    void this.#refresh();
  }

  // Une seule lecture à la fois : une lecture qui dure (3 s au plus) ne se double pas d'une seconde.
  async #refresh(): Promise<void> {
    if (this.#isReading) return;
    this.#isReading = true;
    try {
      const title = await readViewersTitle(this.#url);
      for (const action of this.actions) if (action.isKey()) await action.setTitle(title);
    } catch (error) {
      streamDeck.logger.error("Viewers : le titre n'a pas pu être posé sur la touche.", error);
    } finally {
      this.#isReading = false;
    }
  }
}
