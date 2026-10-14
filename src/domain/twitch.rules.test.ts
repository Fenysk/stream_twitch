import { describe, expect, it } from "vitest";
import {
  hasTwitchScope,
  isTokenFresh,
  RENEW_BEFORE_MS,
  TWITCH_REDIRECT_URI,
  TWITCH_SCOPE,
  TWITCH_TOPIC_SPECS,
  toAuthorizeUrl,
  toGrantedTopics,
  toMissingTopics,
  toRenewedToken,
  toTopicsText,
  toTwitchToken,
} from "./twitch.rules";
import { TwitchStatusSchema, TwitchTokenSchema } from "./twitch.schema";

describe("toAuthorizeUrl : l'adresse où Alexis autorise l'application", () => {
  const url = new URL(toAuthorizeUrl({ clientId: "mon-client", state: "abc123" }));

  it("va sur la page d'autorisation de Twitch", () => {
    expect(url.origin + url.pathname).toBe("https://id.twitch.tv/oauth2/authorize");
  });

  it("demande un code (flux « authorization code ») pour cette application", () => {
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("mon-client");
  });

  it("renvoie vers l'adresse exacte enregistrée : http://localhost:4747/auth/twitch/callback", () => {
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:4747/auth/twitch/callback");
    expect(TWITCH_REDIRECT_URI).toBe("http://localhost:4747/auth/twitch/callback");
  });

  it("demande un droit par abonnement, séparés par des espaces : les follows, les récompenses de points de chaîne, les prédictions", () => {
    const scope = "moderator:read:followers channel:read:redemptions channel:read:predictions";
    expect(url.searchParams.get("scope")).toBe(scope);
    expect(TWITCH_SCOPE).toBe(scope);
  });

  it("porte le state, qui revient tel quel au retour", () => {
    expect(url.searchParams.get("state")).toBe("abc123");
  });

  it("n'ajoute aucun autre paramètre", () => {
    expect([...url.searchParams.keys()].sort()).toEqual([
      "client_id",
      "redirect_uri",
      "response_type",
      "scope",
      "state",
    ]);
  });
});

describe("isTokenFresh : le jeton d'accès se renouvelle une minute avant sa fin", () => {
  it("vaut jusqu'à une minute avant sa fin", () => {
    expect(RENEW_BEFORE_MS).toBe(60_000);
    expect(isTokenFresh({ expiresAt: 1_000_000 }, 939_999)).toBe(true);
    expect(isTokenFresh({ expiresAt: 1_000_000 }, 940_000)).toBe(false);
    expect(isTokenFresh({ expiresAt: 1_000_000 }, 1_000_001)).toBe(false);
  });
});

describe("hasTwitchScope", () => {
  it("lit les droits séparés par des espaces", () => {
    expect(hasTwitchScope("moderator:read:followers")).toBe(true);
    expect(hasTwitchScope("chat:read moderator:read:followers")).toBe(true);
    expect(hasTwitchScope("chat:read")).toBe(false);
    expect(hasTwitchScope("")).toBe(false);
    expect(hasTwitchScope("moderator:read:followers:extra")).toBe(false);
  });
});

describe("les abonnements EventSub du renard", () => {
  it("ont chacun le type, la version et le droit que Twitch donne à cet abonnement", () => {
    expect(TWITCH_TOPIC_SPECS.follow).toMatchObject({
      type: "channel.follow",
      version: "2",
      scope: "moderator:read:followers",
    });
    expect(TWITCH_TOPIC_SPECS.reward).toMatchObject({
      type: "channel.channel_points_custom_reward_redemption.add",
      version: "1",
      scope: "channel:read:redemptions",
    });
    expect(TWITCH_TOPIC_SPECS.prediction).toMatchObject({
      type: "channel.prediction.end",
      version: "1",
      scope: "channel:read:predictions",
    });
  });

  it("se déduisent des droits du jeton : ceux qu'il permet, et ceux qui lui manquent", () => {
    const all = "chat:read moderator:read:followers channel:read:redemptions channel:read:predictions";
    expect(toGrantedTopics(all)).toEqual(["follow", "reward", "prediction"]);
    expect(toMissingTopics(all)).toEqual([]);
    expect(toGrantedTopics("moderator:read:followers")).toEqual(["follow"]);
    expect(toMissingTopics("moderator:read:followers")).toEqual(["reward", "prediction"]);
    expect(toMissingTopics("moderator:read:followers channel:read:redemptions")).toEqual(["prediction"]);
    expect(toGrantedTopics("")).toEqual([]);
    expect(toMissingTopics("")).toEqual(["follow", "reward", "prediction"]);
    expect(toMissingTopics("channel:read:redemptions:extra moderator:read:followers")).toEqual([
      "reward",
      "prediction",
    ]);
  });

  it("s'écrivent en français, reliés par « et »", () => {
    expect(toTopicsText(["follow"])).toBe("les follows");
    expect(toTopicsText(["follow", "reward"])).toBe("les follows et les récompenses de points de chaîne");
    expect(toTopicsText(["follow", "reward", "prediction"])).toBe(
      "les follows, les récompenses de points de chaîne et les prédictions",
    );
    expect(toTopicsText([])).toBe("");
  });
});

describe("le jeton gardé", () => {
  const grant = { accessToken: "acces", refreshToken: "renouvellement", expiresIn: 3600 };
  const identity = { login: "fenysk", userId: "68710381", scope: "moderator:read:followers" };

  it("se compose du don de Twitch, du compte et de l'instant, la fin en ms", () => {
    expect(toTwitchToken(grant, identity, 1_000)).toEqual({
      accessToken: "acces",
      refreshToken: "renouvellement",
      expiresAt: 3_601_000,
      login: "fenysk",
      userId: "68710381",
      scope: "moderator:read:followers",
    });
  });

  it("est à plat, que le schéma accepte, sans liste : Biome le laisse tel quel", () => {
    const token = toTwitchToken(grant, identity, 0);
    expect(TwitchTokenSchema.safeParse(token).success).toBe(true);
    for (const value of Object.values(token)) expect(Array.isArray(value)).toBe(false);
  });

  it("se renouvelle en gardant le compte et les droits, avec les nouveaux jetons et la nouvelle fin", () => {
    const token = toTwitchToken(grant, identity, 0);
    const renewed = toRenewedToken(
      token,
      { accessToken: "acces-2", refreshToken: "renouvellement-2", expiresIn: 14_400 },
      5_000,
    );
    expect(renewed).toEqual({
      ...token,
      accessToken: "acces-2",
      refreshToken: "renouvellement-2",
      expiresAt: 14_405_000,
    });
  });

  it("refuse un fichier incomplet ou sans jeton", () => {
    expect(TwitchTokenSchema.safeParse({}).success).toBe(false);
    expect(
      TwitchTokenSchema.safeParse({ ...toTwitchToken(grant, identity, 0), accessToken: "" }).success,
    ).toBe(false);
  });
});

describe("l'état que les pages reçoivent", () => {
  it("dit seulement s'il est disponible, déconnecté (avec la raison du dernier échec) ou connecté (avec le compte)", () => {
    expect(TwitchStatusSchema.safeParse({ kind: "unavailable" }).success).toBe(true);
    expect(TwitchStatusSchema.safeParse({ kind: "disconnected", lastError: null }).success).toBe(true);
    expect(TwitchStatusSchema.safeParse({ kind: "connected", login: "fenysk", missing: [] }).success).toBe(
      true,
    );
    expect(
      TwitchStatusSchema.safeParse({ kind: "connected", login: "fenysk", missing: ["reward", "prediction"] })
        .success,
    ).toBe(true);
    expect(
      TwitchStatusSchema.safeParse({ kind: "connected", login: "fenysk", missing: ["droit"] }).success,
    ).toBe(false);
    expect(TwitchStatusSchema.safeParse({ kind: "connected" }).success).toBe(false);
  });

  it("n'a aucune place pour un jeton : un champ en plus est écarté du schéma lu", () => {
    const parsed = TwitchStatusSchema.parse({
      kind: "connected",
      login: "fenysk",
      missing: [],
      accessToken: "secret",
    });
    expect(JSON.stringify(parsed)).not.toContain("secret");
  });
});
