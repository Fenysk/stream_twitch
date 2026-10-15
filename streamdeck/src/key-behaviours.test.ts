import { describe, expect, it } from "vitest";
import type { SettingsView } from "../../src/domain/settings.schema";
import {
  CYCLE_BEHAVIOUR,
  PRESET_BEHAVIOUR,
  TOGGLE_BEHAVIOUR,
  toCatalogueAnswer,
  UNSET_TITLE,
} from "./key-behaviours";
import type { FeedSnapshot } from "./settings-feed";

const readyOf = (effective: SettingsView["effective"]): FeedSnapshot => ({
  status: "ready",
  view: { defaults: { threshold: -40 }, local: {}, effective },
  expressions: [],
});

const NO_EXPRESSIONS: FeedSnapshot["status"][] = ["pending", "down", "to-restart"];

describe("TOGGLE_BEHAVIOUR.display", () => {
  const binding = { setting: "foxShouldReadChat" };

  it("écrit le nom de la touche puis ON sur l'image allumée quand le réglage est actif", () => {
    const display = TOGGLE_BEHAVIOUR.display(
      { ...binding, name: "Tchat" },
      readyOf({ threshold: -40, foxShouldReadChat: true }),
    );
    expect(display).toEqual({ title: "Tchat\nON", state: 1 });
  });

  it("écrit OFF sur l'image éteinte quand le réglage est coupé", () => {
    const display = TOGGLE_BEHAVIOUR.display(
      { ...binding, name: "Tchat" },
      readyOf({ threshold: -40, foxShouldReadChat: false }),
    );
    expect(display).toEqual({ title: "Tchat\nOFF", state: 0 });
  });

  it("prend le libellé de la page des réglages quand la touche n'a pas de nom", () => {
    expect(TOGGLE_BEHAVIOUR.display(binding, readyOf({ threshold: -40 })).title).toBe("Lire le tchat\nON");
    expect(TOGGLE_BEHAVIOUR.display({ ...binding, name: "  " }, readyOf({ threshold: -40 })).title).toBe(
      "Lire le tchat\nON",
    );
  });

  it("compte pour actif un réglage absent quand la page des réglages le montre actif", () => {
    expect(
      TOGGLE_BEHAVIOUR.display({ setting: "chatShouldShowHidden" }, readyOf({ threshold: -40 })),
    ).toEqual({
      title: "Afficher les commandes et les bots\nOFF",
      state: 0,
    });
  });

  it("dit que le serveur est éteint ou à relancer à la place du réglage, sur l'image éteinte", () => {
    expect(TOGGLE_BEHAVIOUR.display(binding, { status: "down" })).toEqual({
      title: "Serveur\néteint",
      state: 0,
    });
    expect(TOGGLE_BEHAVIOUR.display(binding, { status: "to-restart" })).toEqual({
      title: "Serveur\nà relancer",
      state: 0,
    });
  });

  it("garde le nom de la touche tant que le serveur n'a pas répondu", () => {
    expect(TOGGLE_BEHAVIOUR.display({ ...binding, name: "Tchat" }, { status: "pending" })).toEqual({
      title: "Tchat",
      state: 0,
    });
  });

  it("demande de choisir un réglage tant que la touche n'en a pas", () => {
    expect(TOGGLE_BEHAVIOUR.display({}, readyOf({ threshold: -40 }))).toEqual({
      title: UNSET_TITLE,
      state: 0,
    });
    expect(TOGGLE_BEHAVIOUR.display({ setting: "foxVoice" }, { status: "down" }).title).toBe(UNSET_TITLE);
  });
});

describe("TOGGLE_BEHAVIOUR.press", () => {
  const viewOf = (effective: SettingsView["effective"]): SettingsView => ({
    defaults: { threshold: -40 },
    local: {},
    effective,
  });

  it("demande l'inverse de la valeur effective", () => {
    expect(
      TOGGLE_BEHAVIOUR.press({ setting: "foxShouldThank" }, viewOf({ threshold: -40, foxShouldThank: true })),
    ).toEqual({ foxShouldThank: false });
    expect(
      TOGGLE_BEHAVIOUR.press(
        { setting: "foxShouldThank" },
        viewOf({ threshold: -40, foxShouldThank: false }),
      ),
    ).toEqual({ foxShouldThank: true });
  });

  it("ne demande rien quand la touche n'a pas de réglage", () => {
    expect(TOGGLE_BEHAVIOUR.press({}, viewOf({ threshold: -40 }))).toBeUndefined();
  });
});

describe("TOGGLE_BEHAVIOUR.wantsExpressions", () => {
  it("n'a jamais besoin des expressions", () => {
    expect(TOGGLE_BEHAVIOUR.wantsExpressions({ setting: "foxShouldThank" })).toBe(false);
  });
});

describe("CYCLE_BEHAVIOUR.display", () => {
  const EXPRESSIONS = [
    { id: "photo", name: "Photo", version: "1", isBuiltIn: true },
    { id: "fdef51f3", name: "Neutre", version: "2", isBuiltIn: false },
  ];
  const readyWith = (effective: SettingsView["effective"]): FeedSnapshot => ({
    status: "ready",
    view: { defaults: { threshold: -40 }, local: {}, effective },
    expressions: EXPRESSIONS,
  });

  it("écrit le nom de la touche puis la valeur qui s'applique, avec le libellé de la page des réglages", () => {
    expect(
      CYCLE_BEHAVIOUR.display(
        { setting: "chatTextSize", values: [24, 32], name: "Tchat" },
        readyWith({ threshold: -40, chatTextSize: 32 }),
      ),
    ).toEqual({ title: "Tchat\n32 px", state: 0 });
    expect(
      CYCLE_BEHAVIOUR.display(
        { setting: "chatDuration", values: [0, 30] },
        readyWith({ threshold: -40, chatDuration: 0 }),
      ).title,
    ).toBe("Durée d'affichage\nToujours");
    expect(
      CYCLE_BEHAVIOUR.display(
        { setting: "chatStyle", values: ["pill", "panel"] },
        readyWith({ threshold: -40, chatStyle: "panel" }),
      ).title,
    ).toBe("Style\nPanneau");
  });

  it("écrit la valeur par défaut de la page des réglages quand le réglage n'a pas de valeur", () => {
    expect(
      CYCLE_BEHAVIOUR.display({ setting: "chatTextSize", values: [] }, readyWith({ threshold: -40 })).title,
    ).toBe("Taille du texte\n20 px");
  });

  it("écrit le nom de l'expression de la tête, et Photo quand le serveur n'en a pas retenu", () => {
    expect(
      CYCLE_BEHAVIOUR.display(
        { setting: "expression", values: ["photo", "fdef51f3"] },
        readyWith({ threshold: -40, expression: "fdef51f3" }),
      ).title,
    ).toBe("Expression\nNeutre");
    expect(
      CYCLE_BEHAVIOUR.display(
        { setting: "expression", values: ["photo", "fdef51f3"] },
        readyWith({ threshold: -40 }),
      ).title,
    ).toBe("Expression\nPhoto");
  });

  it("dit que le serveur est éteint ou à relancer à la place du réglage", () => {
    const binding = { setting: "chatTextSize", values: [24, 32] };
    expect(CYCLE_BEHAVIOUR.display(binding, { status: "down" }).title).toBe("Serveur\néteint");
    expect(CYCLE_BEHAVIOUR.display(binding, { status: "to-restart" }).title).toBe("Serveur\nà relancer");
    expect(CYCLE_BEHAVIOUR.display({ ...binding, name: "Tchat" }, { status: "pending" }).title).toBe("Tchat");
  });

  it("demande de choisir un réglage tant que la touche n'en a pas", () => {
    expect(CYCLE_BEHAVIOUR.display({}, readyWith({ threshold: -40 })).title).toBe(UNSET_TITLE);
  });
});

describe("CYCLE_BEHAVIOUR.press", () => {
  const viewOf = (effective: SettingsView["effective"]): SettingsView => ({
    defaults: { threshold: -40 },
    local: {},
    effective,
  });

  it("demande la valeur suivante de la liste, et revient à la première après la dernière", () => {
    const binding = { setting: "chatTextSize", values: [16, 24, 32] };
    expect(CYCLE_BEHAVIOUR.press(binding, viewOf({ threshold: -40, chatTextSize: 16 }))).toEqual({
      chatTextSize: 24,
    });
    expect(CYCLE_BEHAVIOUR.press(binding, viewOf({ threshold: -40, chatTextSize: 32 }))).toEqual({
      chatTextSize: 16,
    });
    expect(CYCLE_BEHAVIOUR.press(binding, viewOf({ threshold: -40, chatTextSize: 20 }))).toEqual({
      chatTextSize: 16,
    });
  });

  it("ne demande rien quand la touche n'a pas de réglage ou aucune valeur", () => {
    expect(CYCLE_BEHAVIOUR.press({}, viewOf({ threshold: -40 }))).toBeUndefined();
    expect(
      CYCLE_BEHAVIOUR.press({ setting: "chatTextSize", values: [] }, viewOf({ threshold: -40 })),
    ).toBeUndefined();
  });

  it("n'agit pas sur une valeur que le schéma du réglage refuse", () => {
    expect(
      CYCLE_BEHAVIOUR.press({ setting: "chatTextSize", values: [500] }, viewOf({ threshold: -40 })),
    ).toBeUndefined();
  });
});

describe("CYCLE_BEHAVIOUR.wantsExpressions", () => {
  it("n'a besoin des expressions que pour le cycle de l'expression", () => {
    expect(CYCLE_BEHAVIOUR.wantsExpressions({ setting: "expression", values: [] })).toBe(true);
    expect(CYCLE_BEHAVIOUR.wantsExpressions({ setting: "chatStyle", values: [] })).toBe(false);
    expect(CYCLE_BEHAVIOUR.wantsExpressions({})).toBe(false);
  });
});

describe("PRESET_BEHAVIOUR.display", () => {
  const raw = {
    name: "Mode jeu",
    pairs: [
      { setting: "foxShouldReadChat", value: false },
      { setting: "chatTextSize", value: 32 },
    ],
  };
  const readyWith = (effective: SettingsView["effective"]): FeedSnapshot => ({
    status: "ready",
    view: { defaults: { threshold: -40 }, local: {}, effective },
    expressions: [],
  });

  it("écrit son nom, sur l'image active quand le serveur applique déjà toutes ses valeurs", () => {
    expect(
      PRESET_BEHAVIOUR.display(
        raw,
        readyWith({ threshold: -40, foxShouldReadChat: false, chatTextSize: 32 }),
      ),
    ).toEqual({ title: "Mode jeu", state: 1 });
  });

  it("écrit son nom sur l'image inactive dès qu'une valeur diffère", () => {
    expect(
      PRESET_BEHAVIOUR.display(
        raw,
        readyWith({ threshold: -40, foxShouldReadChat: false, chatTextSize: 24 }),
      ),
    ).toEqual({ title: "Mode jeu", state: 0 });
  });

  it("écrit Préréglage quand il n'a pas de nom mais des paires", () => {
    expect(
      PRESET_BEHAVIOUR.display(
        { pairs: [{ setting: "foxShouldReadChat", value: true }] },
        readyWith({ threshold: -40 }),
      ),
    ).toEqual({ title: "Préréglage", state: 1 });
  });

  it("garde son nom tant que le serveur n'a pas répondu, et dit qu'il est éteint ou à relancer", () => {
    expect(PRESET_BEHAVIOUR.display(raw, { status: "pending" })).toEqual({ title: "Mode jeu", state: 0 });
    expect(PRESET_BEHAVIOUR.display(raw, { status: "down" })).toEqual({ title: "Serveur\néteint", state: 0 });
    expect(PRESET_BEHAVIOUR.display(raw, { status: "to-restart" }).title).toBe("Serveur\nà relancer");
  });

  it("demande de choisir un réglage tant qu'il n'a ni nom ni paire", () => {
    expect(PRESET_BEHAVIOUR.display({}, readyWith({ threshold: -40 })).title).toBe(UNSET_TITLE);
  });

  it("garde son nom sans paire, sur l'image inactive", () => {
    expect(PRESET_BEHAVIOUR.display({ name: "Vide" }, readyWith({ threshold: -40 }))).toEqual({
      title: "Vide",
      state: 0,
    });
  });
});

describe("PRESET_BEHAVIOUR.press", () => {
  const view: SettingsView = { defaults: { threshold: -40 }, local: {}, effective: { threshold: -40 } };

  it("demande toutes les paires d'un seul coup", () => {
    expect(
      PRESET_BEHAVIOUR.press(
        {
          pairs: [
            { setting: "foxShouldReadChat", value: false },
            { setting: "chatTextSize", value: 32 },
            { setting: "expression", value: "photo" },
          ],
        },
        view,
      ),
    ).toEqual({ foxShouldReadChat: false, chatTextSize: 32, expression: null });
  });

  it("ne demande rien sans paire, et n'envoie pas une valeur que le schéma du réglage refuse", () => {
    expect(PRESET_BEHAVIOUR.press({ name: "Vide" }, view)).toBeUndefined();
    expect(
      PRESET_BEHAVIOUR.press({ pairs: [{ setting: "chatTextSize", value: 500 }] }, view),
    ).toBeUndefined();
  });
});

describe("PRESET_BEHAVIOUR.wantsExpressions", () => {
  it("n'a pas besoin des noms des expressions : il compare seulement les valeurs", () => {
    expect(PRESET_BEHAVIOUR.wantsExpressions({ pairs: [{ setting: "expression", value: "photo" }] })).toBe(
      false,
    );
  });
});

describe("toCatalogueAnswer", () => {
  it("rend la valeur de chaque réglage offert et les expressions quand le serveur a répondu", () => {
    const answer = toCatalogueAnswer({
      status: "ready",
      view: { defaults: { threshold: -40 }, local: {}, effective: { threshold: -40, foxShouldThank: false } },
      expressions: [{ id: "photo", name: "Photo", version: "1", isBuiltIn: true }],
    });
    expect(answer).toEqual({
      status: "ready",
      values: {
        foxShouldReadChat: true,
        foxShouldReadOwn: true,
        foxShouldReviewAtEnd: true,
        foxShouldThank: false,
        foxShouldWelcome: true,
        chatShouldShowHidden: false,
        chatTextSize: 20,
        chatOpacity: 85,
        chatDuration: 60,
        chatMaxMessages: 8,
        chatStyle: "pill",
        chatAnimation: "rise",
        expression: "photo",
      },
      expressions: [{ id: "photo", name: "Photo", version: "1", isBuiltIn: true }],
    });
  });

  it("dit pourquoi le serveur n'a pas pu être lu", () => {
    expect(toCatalogueAnswer({ status: "down" })).toEqual({ status: "down" });
    expect(toCatalogueAnswer({ status: "to-restart" })).toEqual({ status: "to-restart" });
    for (const status of NO_EXPRESSIONS)
      expect(toCatalogueAnswer({ status } as FeedSnapshot).status).not.toBe("ready");
  });
});
