import {
  type KeyDownEvent,
  type KeyUpEvent,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { EndDirection } from "../../src/domain/hours.rules";
import type { EndTimeKeys } from "./end-time-keys";

// Les touches « Fin du live +10 » ou « −10 » : le SDK n'apporte que les évènements, tout le reste est dans EndTimeKeys, que les
// deux actions partagent.
export class EndTimeAction extends SingletonAction {
  override readonly manifestId: string;
  readonly #direction: EndDirection;
  readonly #keys: EndTimeKeys;

  constructor(uuid: string, direction: EndDirection, keys: EndTimeKeys) {
    super();
    this.manifestId = uuid;
    this.#direction = direction;
    this.#keys = keys;
  }

  override onWillAppear(ev: WillAppearEvent): void {
    if (ev.action.isKey()) this.#keys.appear(ev.action.id, this.#direction, ev.action);
  }

  override onWillDisappear(ev: WillDisappearEvent): void {
    this.#keys.disappear(ev.action.id);
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    await this.#keys.press(ev.action.id);
  }

  override async onKeyUp(ev: KeyUpEvent): Promise<void> {
    await this.#keys.release(ev.action.id);
  }
}
