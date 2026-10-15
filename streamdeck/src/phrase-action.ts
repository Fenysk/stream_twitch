import streamDeck, {
  type DidReceiveSettingsEvent,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";
import { toPhraseBinding } from "../../src/domain/deck.rules";
import { PHRASE_ACTION_UUID } from "./action-ids";
import { sendPhrase, toPhraseRequest, toPhraseTitle } from "./phrase-request";

// La touche « Phrase » : un appui fait dire un texte au renard, ou son bilan du live. Un succès fait cligner la coche, un refus
// ou un serveur injoignable l'alerte. Elle ne lit rien : son titre est son nom.
export class PhraseAction extends SingletonAction {
  override readonly manifestId = PHRASE_ACTION_UUID;
  readonly #baseUrl: string;

  constructor(baseUrl: string) {
    super();
    this.#baseUrl = baseUrl;
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    await this.#showTitle(ev.action, ev.payload.settings);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent): Promise<void> {
    await this.#showTitle(ev.action, ev.payload.settings);
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      const binding = toPhraseBinding(ev.payload.settings);
      const request = binding && toPhraseRequest(binding);
      if (!request) {
        await ev.action.showAlert();
        return;
      }
      const outcome = await sendPhrase(this.#baseUrl, request);
      if (outcome.ok) {
        await ev.action.showOk();
        return;
      }
      streamDeck.logger.warn("Le serveur n'a pas dit la phrase.", outcome);
      await ev.action.showAlert();
    } catch (error) {
      streamDeck.logger.error("Un appui sur la touche Phrase a échoué.", error);
    }
  }

  async #showTitle(action: WillAppearEvent["action"], settings: unknown): Promise<void> {
    if (!action.isKey()) return;
    try {
      await action.setTitle(toPhraseTitle(settings));
    } catch (error) {
      streamDeck.logger.error("Le titre de la touche Phrase n'a pas pu être posé.", error);
    }
  }
}
