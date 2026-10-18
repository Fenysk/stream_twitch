import { describe, expect, it } from "vitest";
import type { HeadView } from "../../domain/head.types";
import { IDLE_SHOW, SHOW_HEAD_EVENT, type ShowState } from "../../domain/show.schema";
import { createHeadFeed } from "../../usecase/head.usecase";
import { openShowStream } from "./show-stream";

const head = (id: string, mouth: HeadView["mouth"] = { kind: "closed" }): HeadView => ({
  width: 10,
  height: 10,
  cut: { left: { x: 1, y: 2 }, right: { x: 3, y: 4 } },
  tilt: 1,
  opening: 1,
  scale: 1,
  closing: 0,
  topHeight: 3,
  expression: { id, version: "1" },
  idle: { angle: 0, lift: 0 },
  mouth,
});

// Un faux directeur : il garde l'état et ceux qui l'écoutent, et compte les pages /show ouvertes.
const createDirector = () => {
  let state: ShowState = IDLE_SHOW;
  const listeners = new Set<(next: ShowState) => void>();
  let pages = 0;
  return {
    director: {
      getState: () => state,
      subscribe(listener: (next: ShowState) => void) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      openPage() {
        pages += 1;
        return () => {
          pages -= 1;
        };
      },
    },
    publish(next: ShowState) {
      state = next;
      for (const listener of listeners) listener(next);
    },
    listeners: () => listeners.size,
    pages: () => pages,
  };
};

// Ce que la page reçoit, dans l'ordre : `état` sans nom, ou le nom de l'évènement.
const setup = (isPage: boolean) => {
  const shown = createDirector();
  const feed = createHeadFeed(head("neutre"));
  const received: string[] = [];
  const close = openShowStream(
    { director: shown.director, feed },
    isPage,
    (state) => received.push(`état ${state.showFader}`),
    (event, view) =>
      received.push(`${event} ${view.expression.id}${view.mouth.kind === "open" ? " ouverte" : ""}`),
  );
  return { ...shown, feed, received, close };
};

describe("openShowStream : la page /show", () => {
  it("Quand la page /show se connecte, le système doit lui envoyer l'état, puis la vue de la tête sous son nom", () => {
    const { received } = setup(true);
    expect(received).toEqual(["état 100", `${SHOW_HEAD_EVENT} neutre`]);
  });

  it("lui envoie ensuite chaque changement de la tête sous son nom, et chaque changement d'état sans nom, dans l'ordre", () => {
    const { received, feed, publish } = setup(true);
    received.length = 0;
    feed.publish(head("neutre", { kind: "open", pose: { pivot: "left", angle: 7 } }));
    publish({ ...IDLE_SHOW, showFader: 15 });
    feed.publish(head("fatigue"));
    expect(received).toEqual([`${SHOW_HEAD_EVENT} neutre ouverte`, "état 15", `${SHOW_HEAD_EVENT} fatigue`]);
  });

  it("compte la page, et la libère à la déconnexion avec les deux abonnements", () => {
    const { pages, listeners, received, feed, close } = setup(true);
    expect(pages()).toBe(1);
    expect(listeners()).toBe(1);
    close();
    expect(pages()).toBe(0);
    expect(listeners()).toBe(0);
    received.length = 0;
    feed.publish(head("fatigue"));
    expect(received).toEqual([]);
  });
});

describe("openShowStream : l'onglet Émission et /countdown", () => {
  it("Quand une page ne se connecte pas comme page /show, le système ne doit lui envoyer que l'état", () => {
    const { received, feed, publish } = setup(false);
    feed.publish(head("fatigue"));
    publish({ ...IDLE_SHOW, showFader: 15 });
    expect(received).toEqual(["état 100", "état 15"]);
  });

  it("ne la compte pas comme une page /show", () => {
    const { pages } = setup(false);
    expect(pages()).toBe(0);
  });

  it("se désabonne de l'état à la déconnexion", () => {
    const { listeners, close } = setup(false);
    expect(listeners()).toBe(1);
    close();
    expect(listeners()).toBe(0);
  });
});
