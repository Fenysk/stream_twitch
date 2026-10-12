import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatPreview } from "./chat-preview";

describe("ChatPreview", () => {
  it("pose son cadre sur un damier, nommé pour les lecteurs d'écran, sans bouton : les messages de test défilent seuls", () => {
    const html = renderToStaticMarkup(<ChatPreview />);
    expect(html).toContain("chat-preview-stage settings-checker");
    expect(html).toContain('aria-label="Aperçu du tchat"');
    expect(html).not.toContain("<button");
  });

  it("n'affiche aucune colonne avant la première allure envoyée par le serveur", () => {
    expect(renderToStaticMarkup(<ChatPreview />)).not.toContain("chat-column");
  });
});
