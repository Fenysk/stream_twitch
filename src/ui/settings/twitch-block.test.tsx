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
    const html = render({ kind: "connected", login: "fenysk", missing: [] });
    expect(html).toContain("Connecté en tant que fenysk.");
    expect(html).toContain("Se déconnecter");
    expect(html).not.toContain("Se connecter à Twitch");
    expect(html).not.toContain("/auth/twitch/start");
  });

  it("grise « Se déconnecter » pendant la demande", () => {
    expect(render({ kind: "connected", login: "fenysk", missing: [] }, { isBusy: true })).toContain(
      "disabled",
    );
    expect(render({ kind: "connected", login: "fenysk", missing: [] })).not.toContain("disabled");
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

  it("dit que les follows, les récompenses de points de chaîne et les prédictions ont besoin de la connexion, et pas les subs, les cheers ni les raids", () => {
    const html = render({ kind: "connected", login: "fenysk", missing: [] });
    expect(html).toContain(
      "Les follows, les récompenses de points de chaîne et les prédictions se lisent avec cette connexion",
    );
    expect(html).toContain("les cheers et les raids n&#x27;en ont pas besoin");
  });

  it("dit de se reconnecter quand le jeton gardé ne couvre pas les récompenses de points de chaîne, avec un bouton qui ouvre l'autorisation", () => {
    const html = render({ kind: "connected", login: "fenysk", missing: ["reward"] });
    expect(html).toContain("Connecté en tant que fenysk.");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Reconnecte-toi");
    expect(html).toContain("les récompenses de points de chaîne");
    expect(html).toContain("Se reconnecter à Twitch");
    expect(html).toContain('href="/auth/twitch/start"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("Se déconnecter");
  });

  it("dit tout ce qui manque au jeton gardé, dans l'ordre : les récompenses, puis les prédictions", () => {
    const html = render({ kind: "connected", login: "fenysk", missing: ["reward", "prediction"] });
    expect(html).toContain("ne couvre pas les récompenses de points de chaîne et les prédictions");
    expect(render({ kind: "connected", login: "fenysk", missing: ["prediction"] })).toContain(
      "ne couvre pas les prédictions",
    );
  });

  it("ne propose pas de se reconnecter quand le jeton couvre tout", () => {
    const html = render({ kind: "connected", login: "fenysk", missing: [] });
    expect(html).not.toContain("Se reconnecter");
    expect(html).not.toContain("Reconnecte-toi");
    expect(html).not.toContain('role="alert"');
  });
});
