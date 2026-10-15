import { describe, expect, it } from "vitest";
import { toTwitchHint } from "./twitch-hint";

describe("toTwitchHint : ce que l'onglet Points de chaîne dit de la connexion", () => {
  it("ne dit rien quand Twitch est connecté avec tous les droits, ou tant que l'état n'est pas lu", () => {
    expect(toTwitchHint({ kind: "connected", login: "fenysk", missing: [] })).toBeNull();
    expect(toTwitchHint(null)).toBeNull();
  });

  it("dit d'aller dans l'onglet Renard quand Twitch n'est pas connecté", () => {
    expect(toTwitchHint({ kind: "disconnected", lastError: null })).toBe(
      "Twitch n'est pas connecté : connecte-le dans l'onglet Renard pour créer les récompenses des sons.",
    );
  });

  it("dit de se reconnecter quand il manque le droit de gérer les récompenses, pas pour un autre droit", () => {
    expect(toTwitchHint({ kind: "connected", login: "fenysk", missing: ["reward"] })).toContain(
      "reconnecte-toi dans l'onglet Renard",
    );
    expect(toTwitchHint({ kind: "connected", login: "fenysk", missing: ["prediction"] })).toBeNull();
  });

  it("dit ce qui manque dans .env quand Twitch est indisponible", () => {
    expect(toTwitchHint({ kind: "unavailable" })).toContain("TWITCH_CLIENT_ID et TWITCH_CLIENT_SECRET");
  });
});
