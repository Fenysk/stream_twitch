import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TwitchStatus } from "../../domain/twitch.schema";
import { TwitchBlock } from "./twitch-block";

const render = (
  status: TwitchStatus | null,
  options: { error?: string | null; isBusy?: boolean } = {},
): string =>
  renderToStaticMarkup(
    createElement(TwitchBlock, {
      status,
      error: options.error ?? null,
      isBusy: options.isBusy ?? false,
      onDisconnect: () => undefined,
    }),
  );

describe("le bloc « Connexion à Twitch »", () => {
  it("dit « Non connecté » et propose « Se connecter à Twitch », qui ouvre l'autorisation dans un autre onglet", () => {
    const html = render({ kind: "disconnected", lastError: null });
    expect(html).toContain("Connexion à Twitch");
    expect(html).toContain("Non connecté.");
    expect(html).toContain("Se connecter à Twitch");
    expect(html).toContain('href="/auth/twitch/start"');
    expect(html).toContain('target="_blank"');
    expect(html).not.toContain("Se déconnecter");
  });

  it("explique le retour : l'état change tout seul, et l'adresse de retour à enregistrer chez Twitch", () => {
    const html = render({ kind: "disconnected", lastError: null });
    expect(html).toContain("l&#x27;état change tout seul");
    expect(html).toContain("http://localhost:4747/auth/twitch/callback");
  });

  it("dit « Connecté en tant que … » et propose « Se déconnecter », sans proposer de se connecter", () => {
    const html = render({ kind: "connected", login: "fenysk" });
    expect(html).toContain("Connecté en tant que fenysk.");
    expect(html).toContain("Se déconnecter");
    expect(html).not.toContain("Se connecter à Twitch");
    expect(html).not.toContain("/auth/twitch/start");
  });

  it("grise « Se déconnecter » pendant la demande", () => {
    expect(render({ kind: "connected", login: "fenysk" }, { isBusy: true })).toContain("disabled");
    expect(render({ kind: "connected", login: "fenysk" })).not.toContain("disabled");
  });

  it("écrit la raison du dernier échec de connexion", () => {
    const html = render({
      kind: "disconnected",
      lastError: "Connexion à Twitch échouée : autorisation refusée sur Twitch.",
    });
    expect(html).toContain('role="alert"');
    expect(html).toContain("autorisation refusée sur Twitch");
  });

  it("dit pourquoi la connexion est indisponible, sans bouton", () => {
    const html = render({ kind: "unavailable" });
    expect(html).toContain("TWITCH_CLIENT_ID et TWITCH_CLIENT_SECRET manquent dans .env");
    expect(html).not.toContain("Se connecter à Twitch");
    expect(html).not.toContain("Se déconnecter");
  });

  it("montre le chargement tant que le serveur n'a pas répondu", () => {
    const html = render(null);
    expect(html).toContain("Chargement…");
    expect(html).not.toContain("Se connecter à Twitch");
  });

  it("écrit l'erreur de lecture de l'état", () => {
    expect(render(null, { error: "le serveur ne répond pas" })).toContain("le serveur ne répond pas");
  });

  it("dit que les follows ont besoin de la connexion, et pas les subs ni les cheers", () => {
    const html = render({ kind: "connected", login: "fenysk" });
    expect(html).toContain("Les follows se lisent avec cette connexion");
    expect(html).toContain("n&#x27;en ont pas besoin");
  });
});
