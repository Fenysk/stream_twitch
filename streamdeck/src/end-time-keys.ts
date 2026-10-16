import { END_STEP_MINUTES, type EndDirection, toSteppedEndTime } from "../../src/domain/hours.rules";
import { SERVER_DOWN_TITLE, SERVER_TO_RESTART_TITLE } from "./server-request";
import type { FeedSnapshot, SettingsFeed } from "./settings-feed";

// Une touche vue d'ici : un titre à poser, une alerte à montrer (le SDK les fait).
export type EndStepKey = { setTitle(title: string): Promise<void>; showAlert(): Promise<void> };

export type EndStepLog = {
  warn(message: string, detail: unknown): void;
  error(message: string, detail: unknown): void;
};

// Maintenir une touche : un cran à l'appui, un autre après HOLD_DELAY_MS, puis un cran après chaque écart jusqu'au relâché. Le
// premier écart dure HOLD_FIRST_GAP_MS, chacun suivant vaut HOLD_GAP_FACTOR fois le précédent, sans descendre sous HOLD_MIN_GAP_MS.
const HOLD_DELAY_MS = 500;
const HOLD_FIRST_GAP_MS = 300;
const HOLD_GAP_FACTOR = 0.85;
const HOLD_MIN_GAP_MS = 60;

// L'écart (ms) qui suit le cran de répétition `index` (0 : le cran de HOLD_DELAY_MS) : 300, 255, 217, 184… puis 60.
export const toHoldGap = (index: number): number =>
  Math.max(HOLD_MIN_GAP_MS, Math.round(HOLD_FIRST_GAP_MS * HOLD_GAP_FACTOR ** index));

const LABELS: Record<EndDirection, string> = {
  later: `+${END_STEP_MINUTES} min`,
  sooner: `−${END_STEP_MINUTES} min`,
};
const NO_END_TEXT = "--:--";

export const toEndKeyTitle = (direction: EndDirection, endTime: string): string =>
  `${LABELS[direction]}\n${endTime === "" ? NO_END_TEXT : endTime}`;

// Au repos, la touche montre la fin réglée sur le serveur, ou pourquoi il ne la donne pas.
const toRestingTitle = (direction: EndDirection, snapshot: FeedSnapshot): string => {
  if (snapshot.status === "ready") return toEndKeyTitle(direction, snapshot.view.effective.foxEndTime ?? "");
  if (snapshot.status === "down") return SERVER_DOWN_TITLE;
  if (snapshot.status === "to-restart") return SERVER_TO_RESTART_TITLE;
  return LABELS[direction];
};

// Un appui, du bouton enfoncé au relâché : la touche tenue, la valeur du serveur au départ, le brouillon que toutes les touches
// de fin montrent pendant l'appui, le minuteur du maintien.
type Press = {
  id: string;
  direction: EndDirection;
  isReleased: boolean;
  isStarted: boolean;
  initial: string;
  value: string;
  timer: ReturnType<typeof setTimeout> | undefined;
};

const stopHold = (press: Press): void => {
  clearTimeout(press.timer);
  press.timer = undefined;
};

type RegisteredKey = { key: EndStepKey; direction: EndDirection };

// Les touches « Fin du live » (+10 et −10, une ou plusieurs de chaque) : un appui fait un cran sur la fin prévue du serveur, le
// maintien en fait d'autres, et la valeur finale est envoyée une seule fois au relâché. Une seule touche agit à la fois ; pendant
// son appui, toutes les touches de fin montrent la valeur qui défile (chacune avec son libellé), puis reviennent à la lecture
// partagée du serveur.
export class EndTimeKeys {
  readonly #feed: SettingsFeed;
  readonly #clock: () => number;
  readonly #log: EndStepLog;
  readonly #keys = new Map<string, RegisteredKey>();
  #press: Press | undefined;

  constructor(feed: SettingsFeed, clock: () => number, log: EndStepLog) {
    this.#feed = feed;
    this.#clock = clock;
    this.#log = log;
    feed.onUpdate(() => void this.#renderAll());
  }

  appear(id: string, direction: EndDirection, key: EndStepKey): void {
    this.#keys.set(id, { key, direction });
    this.#feed.show(id, false);
    void this.#render(id);
  }

  // La touche tenue qui disparaît (autre page) n'envoie rien, le relâché ne viendra pas : le brouillon est vidé, les autres
  // touches reviennent au serveur.
  disappear(id: string): void {
    this.#keys.delete(id);
    this.#feed.hide(id);
    const press = this.#press;
    if (press?.id !== id) return;
    stopHold(press);
    this.#press = undefined;
    void this.#renderAll();
  }

  // Le premier cran part de la fin du serveur à cet instant, relue après les écritures en cours. Un appui pendant celui d'une
  // autre touche de fin est ignoré.
  async press(id: string): Promise<void> {
    const registered = this.#keys.get(id);
    if (!registered || this.#press) return;
    const press: Press = {
      id,
      direction: registered.direction,
      isReleased: false,
      isStarted: false,
      initial: "",
      value: "",
      timer: undefined,
    };
    this.#press = press;
    const snapshot = await this.#feed.run(() => this.#feed.refresh());
    if (this.#press !== press) return;
    if (snapshot.status !== "ready") {
      this.#press = undefined;
      await this.#showAlert(id);
      await this.#renderAll();
      return;
    }
    press.initial = snapshot.view.effective.foxEndTime ?? "";
    press.value = press.initial;
    press.isStarted = true;
    const canMove = this.#step(press);
    if (press.isReleased) await this.#commit(press);
    else if (canMove) this.#schedule(press, HOLD_DELAY_MS, 0);
  }

  async release(id: string): Promise<void> {
    const press = this.#press;
    if (press?.id !== id) return;
    press.isReleased = true;
    if (press.isStarted) await this.#commit(press);
  }

  // Un cran de plus ; faux quand la fin ne bouge plus (rien à changer, ou une limite).
  #step(press: Press): boolean {
    const next = toSteppedEndTime(press.value, this.#clock(), press.direction);
    if (next === press.value) return false;
    press.value = next;
    void this.#renderAll();
    return true;
  }

  // Le cran de répétition `index` dans `delayMs`, puis le suivant après toHoldGap(index) : un minuteur réarmé à chaque cran, de
  // plus en plus court, éteint quand la fin ne bouge plus.
  #schedule(press: Press, delayMs: number, index: number): void {
    press.timer = setTimeout(() => {
      press.timer = undefined;
      if (this.#step(press)) this.#schedule(press, toHoldGap(index), index + 1);
    }, delayMs);
  }

  // Le relâché : une seule écriture de la valeur finale, aucune si elle est celle du serveur. Le brouillon reste jusqu'à la fin de
  // l'écriture, puis toutes les touches reviennent à la lecture du serveur.
  async #commit(press: Press): Promise<void> {
    stopHold(press);
    try {
      if (press.value !== press.initial) {
        const result = await this.#feed.run(() => this.#feed.change({ foxEndTime: press.value }));
        if (!result.ok) {
          if (result.reason === "refused") this.#log.warn("Le serveur refuse la fin du live.", result.issues);
          await this.#showAlert(press.id);
        }
      }
    } catch (error) {
      this.#log.error("L'heure de fin n'a pas pu être envoyée.", error);
    } finally {
      if (this.#press === press) this.#press = undefined;
      await this.#renderAll();
    }
  }

  async #showAlert(id: string): Promise<void> {
    try {
      await this.#keys.get(id)?.key.showAlert();
    } catch (error) {
      this.#log.error("L'alerte de la touche n'a pas pu être montrée.", error);
    }
  }

  async #renderAll(): Promise<void> {
    await Promise.all([...this.#keys.keys()].map((id) => this.#render(id)));
  }

  async #render(id: string): Promise<void> {
    const registered = this.#keys.get(id);
    if (!registered) return;
    const { key, direction } = registered;
    const draft = this.#press?.isStarted ? this.#press.value : undefined;
    const title =
      draft === undefined ? toRestingTitle(direction, this.#feed.snapshot) : toEndKeyTitle(direction, draft);
    try {
      await key.setTitle(title);
    } catch (error) {
      this.#log.error("Le titre de la touche n'a pas pu être posé.", error);
    }
  }
}
