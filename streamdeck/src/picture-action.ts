import streamDeck, {
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import { PICTURE_ACTION_UUID } from "./action-ids";
import type { PictureFeed } from "./picture-feed";
import { sendPictureNext } from "./picture-request";
import { toPictureTitle } from "./picture-title";

// La touche : le SDK ne nomme pas son type, on le prend sur l'évènement (la seule action à avoir setState).
type KeyAction = Extract<WillAppearEvent["action"], { setState: unknown }>;

// La touche « Image » : son titre est le membre à l'image dans la place caméra d'OBS, que le serveur dit tout de suite (flux SSE, partagé
// par toutes les touches). Un appui passe au membre suivant : PC, les caméras disponibles, Tête, puis PC. Un refus ou un serveur injoignable
// alerte la touche ; un succès ne dit rien, le titre change avec l'image.
export class PictureAction extends SingletonAction {
  override readonly manifestId = PICTURE_ACTION_UUID;
  readonly #feed: PictureFeed;
  readonly #baseUrl: string;
  readonly #keys = new Map<string, KeyAction>();

  constructor(feed: PictureFeed, baseUrl: string) {
    super();
    this.#feed = feed;
    this.#baseUrl = baseUrl;
    feed.onUpdate(() => void this.#renderAll());
  }

  override onWillAppear(ev: WillAppearEvent): void {
    if (!ev.action.isKey()) return;
    this.#keys.set(ev.action.id, ev.action);
    this.#feed.show(ev.action.id);
    void this.#render(ev.action.id);
  }

  override onWillDisappear(ev: WillDisappearEvent): void {
    this.#keys.delete(ev.action.id);
    this.#feed.hide(ev.action.id);
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      const outcome = await sendPictureNext(this.#baseUrl);
      if (outcome.ok) return;
      streamDeck.logger.warn("Le serveur ne change pas l'image.", outcome);
      await ev.action.showAlert();
    } catch (error) {
      streamDeck.logger.error("Un appui sur la touche Image a échoué.", error);
    }
  }

  async #renderAll(): Promise<void> {
    await Promise.all([...this.#keys.keys()].map((id) => this.#render(id)));
  }

  async #render(id: string): Promise<void> {
    try {
      await this.#keys.get(id)?.setTitle(toPictureTitle(this.#feed.snapshot));
    } catch (error) {
      streamDeck.logger.error("Le titre de la touche Image n'a pas pu être posé.", error);
    }
  }
}
