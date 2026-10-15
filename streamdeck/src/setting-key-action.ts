import streamDeck, {
  type DidReceiveSettingsEvent,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import { InspectorRequestSchema } from "../../src/domain/deck.schema";
import { type KeyBehaviour, toCatalogueAnswer } from "./key-behaviours";
import type { SettingsFeed } from "./settings-feed";

// La touche : le SDK ne nomme pas son type de réglages, on le prend sur l'évènement (la seule action à avoir setState).
type KeyAction = Extract<WillAppearEvent["action"], { setState: unknown }>;

type VisibleKey = { action: KeyAction; settings: unknown };

// Le SDK ne publie pas le type JSON de ses messages : celui de la méthode de base suffit.
type SendToPlugin = Parameters<NonNullable<SingletonAction["onSendToPlugin"]>>[0];

// Une action qui montre un réglage du serveur : toutes ses touches visibles suivent la lecture partagée (SettingsFeed), et
// ce qui les distingue (titre, image, ce qu'un appui change) est dans leur KeyBehaviour.
export class SettingKeyAction extends SingletonAction {
  override readonly manifestId: string;
  readonly #feed: SettingsFeed;
  readonly #behaviour: KeyBehaviour;
  readonly #keys = new Map<string, VisibleKey>();

  constructor(feed: SettingsFeed, behaviour: KeyBehaviour) {
    super();
    this.manifestId = behaviour.uuid;
    this.#feed = feed;
    this.#behaviour = behaviour;
    feed.onUpdate(() => void this.#renderAll());
  }

  override onWillAppear(ev: WillAppearEvent): void {
    if (!ev.action.isKey()) return;
    const { id } = ev.action;
    this.#keys.set(id, { action: ev.action, settings: ev.payload.settings });
    this.#feed.show(id, this.#behaviour.wantsExpressions(ev.payload.settings));
    void this.#render(id);
  }

  override onWillDisappear(ev: WillDisappearEvent): void {
    this.#keys.delete(ev.action.id);
    this.#feed.hide(ev.action.id);
  }

  override onDidReceiveSettings(ev: DidReceiveSettingsEvent): void {
    const key = this.#keys.get(ev.action.id);
    if (!key) return;
    key.settings = ev.payload.settings;
    this.#feed.want(ev.action.id, this.#behaviour.wantsExpressions(ev.payload.settings));
    void this.#render(ev.action.id);
  }

  // Un appui relit le serveur avant d'agir : l'effet porte sur la valeur du moment, pas sur celle d'il y a 10 s.
  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      await this.#feed.run(async () => {
        const snapshot = await this.#feed.refresh();
        const changes =
          snapshot.status === "ready" ? this.#behaviour.press(ev.payload.settings, snapshot.view) : undefined;
        if (!changes) {
          await ev.action.showAlert();
          return;
        }
        const result = await this.#feed.change(changes);
        if (result.ok) return;
        if (result.reason === "refused") {
          streamDeck.logger.warn("Le serveur refuse le changement de la touche.", result.issues);
        }
        await ev.action.showAlert();
      });
    } catch (error) {
      streamDeck.logger.error("Un appui sur la touche a échoué.", error);
    }
  }

  // L'inspecteur ne parle jamais au serveur : il demande ici ce qu'il doit montrer.
  override async onSendToPlugin(ev: SendToPlugin): Promise<void> {
    const request = InspectorRequestSchema.safeParse(ev.payload);
    if (!request.success) {
      streamDeck.logger.warn("Message de l'inspecteur inconnu.", ev.payload);
      return;
    }
    try {
      const snapshot = await this.#feed.refresh({ withExpressions: true });
      await streamDeck.ui.sendToPropertyInspector(toCatalogueAnswer(snapshot));
    } catch (error) {
      streamDeck.logger.error("Le catalogue n'a pas pu être envoyé à l'inspecteur.", error);
    }
  }

  async #renderAll(): Promise<void> {
    await Promise.all([...this.#keys.keys()].map((id) => this.#render(id)));
  }

  async #render(id: string): Promise<void> {
    const key = this.#keys.get(id);
    if (!key) return;
    try {
      const { title, state } = this.#behaviour.display(key.settings, this.#feed.snapshot);
      await key.action.setState(state);
      await key.action.setTitle(title);
    } catch (error) {
      streamDeck.logger.error("Le titre de la touche n'a pas pu être posé.", error);
    }
  }
}
