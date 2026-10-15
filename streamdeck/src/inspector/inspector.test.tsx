import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CYCLE_ACTION_UUID, PHRASE_ACTION_UUID, PRESET_ACTION_UUID, TOGGLE_ACTION_UUID } from "../action-ids";
import type { CatalogueState } from "./catalogue-state";
import { Inspector } from "./inspector";

const render = (action: string, catalogue: CatalogueState = { status: "loading" }): string =>
  renderToStaticMarkup(
    createElement(Inspector, {
      action,
      settings: {},
      catalogue,
      onChange: () => undefined,
      onRetry: () => undefined,
    }),
  );

describe("le panneau", () => {
  it("choisit le formulaire de l'interrupteur pour l'action Interrupteur", () => {
    expect(render(TOGGLE_ACTION_UUID)).toContain("Réglage à basculer");
  });

  it("choisit le formulaire du cycle pour l'action Cycle de valeurs", () => {
    expect(render(CYCLE_ACTION_UUID)).toContain("Réglage à parcourir");
  });

  it("choisit le formulaire du préréglage pour l'action Préréglage", () => {
    expect(render(PRESET_ACTION_UUID)).toContain("Nom du préréglage");
  });

  it("choisit le formulaire de la phrase pour l'action Phrase", () => {
    expect(render(PHRASE_ACTION_UUID)).toContain("Ce que dit la touche");
  });

  it("dit qu'il n'y a rien à régler pour une action qu'il ne connaît pas", () => {
    expect(render("com.fenysk.stream-twitch.viewers")).toContain("Cette action n&#x27;a rien à régler.");
  });

  it("dit que le serveur ne répond pas, avec un bouton pour réessayer, sans cacher le formulaire", () => {
    const html = render(TOGGLE_ACTION_UUID, { status: "down" });
    expect(html).toContain("Le serveur ne répond pas.");
    expect(html).toContain("Réessayer");
    expect(html).toContain("Réglage à basculer");
  });

  it("dit que le serveur répond autre chose que prévu quand sa réponse est illisible", () => {
    expect(render(TOGGLE_ACTION_UUID, { status: "to-restart" })).toContain(
      "Le serveur répond autre chose que prévu.",
    );
  });

  it("n'écrit aucun message d'erreur quand le serveur a répondu ou qu'on attend sa réponse", () => {
    expect(render(TOGGLE_ACTION_UUID, { status: "ready", values: {}, expressions: [] })).not.toContain(
      "Réessayer",
    );
    expect(render(TOGGLE_ACTION_UUID)).not.toContain("Réessayer");
  });
});
