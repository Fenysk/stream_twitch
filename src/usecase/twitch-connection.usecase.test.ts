import { describe, expect, it } from "vitest";
import type { LiveEvent } from "../domain/live.types";
import { type TokenGrant, TWITCH_SCOPE, type TwitchIdentity } from "../domain/twitch.rules";
import type { TwitchToken } from "../domain/twitch.schema";
import {
  type AuthResult,
  createTwitchConnection,
  type EventFeedTarget,
  type LoginQuery,
} from "./twitch-connection.usecase";

const START = 1_000_000;
// Les droits que le renard demande : un jeton neuf les a tous. Un jeton d'avant les récompenses n'a que les follows, un jeton
// d'avant les prédictions n'a pas le dernier.
const SCOPE = TWITCH_SCOPE;
const FOLLOWS_ONLY = "moderator:read:followers";
const WITHOUT_PREDICTIONS = "moderator:read:followers channel:read:redemptions";

const storedToken: TwitchToken = {
  accessToken: "ACCESS-STORED",
  refreshToken: "REFRESH-STORED",
  expiresAt: START + 3_600_000,
  login: "fenysk",
  userId: "68710381",
  scope: SCOPE,
};

const ok = <Value>(value: Value): AuthResult<Value> => ({ ok: true, value });
const refusal = (message: string): AuthResult<never> => ({ ok: false, isRefused: true, message });
const outage = (message: string): AuthResult<never> => ({ ok: false, isRefused: false, message });

// Un faux Twitch à la main : les réponses sont celles que le test pose, chaque appel est noté.
const setup = (
  options: { token?: TwitchToken | null; isAvailable?: boolean; broadcasterId?: string | undefined } = {},
) => {
  const state = {
    now: START,
    token: options.token === undefined ? null : options.token,
    nextState: 0,
    exchange: ok<TokenGrant>({ accessToken: "ACCESS-1", refreshToken: "REFRESH-1", expiresIn: 14_400 }),
    refreshResults: [] as AuthResult<TokenGrant>[],
    identity: ok<TwitchIdentity>({
      login: "fenysk",
      userId: "68710381",
      scope: SCOPE,
    }) as AuthResult<TwitchIdentity>,
    revoke: ok<null>(null) as AuthResult<null>,
    refreshGate: null as Promise<void> | null,
  };
  const calls = {
    exchange: [] as string[],
    refresh: [] as string[],
    identity: [] as string[],
    revoke: [] as string[],
    updates: [] as TwitchToken[],
    deletes: 0,
    opens: [] as EventFeedTarget[],
    closes: 0,
    events: [] as LiveEvent[],
  };
  const logs: string[] = [];
  const timers: { at: number; callback: () => void; isCancelled: boolean }[] = [];
  const connection = createTwitchConnection({
    app:
      options.isAvailable === false
        ? undefined
        : {
            clientId: "mon-client",
            auth: {
              async exchangeCode(code) {
                calls.exchange.push(code);
                return state.exchange;
              },
              async refresh(refreshToken) {
                calls.refresh.push(refreshToken);
                if (state.refreshGate) await state.refreshGate;
                return (
                  state.refreshResults.shift() ??
                  ok({
                    accessToken: `ACCESS-R${calls.refresh.length}`,
                    refreshToken: `REFRESH-R${calls.refresh.length}`,
                    expiresIn: 14_400,
                  })
                );
              },
              async getIdentity(accessToken) {
                calls.identity.push(accessToken);
                return state.identity;
              },
              async revoke(accessToken) {
                calls.revoke.push(accessToken);
                return state.revoke;
              },
            },
            feed: {
              open(feedOptions) {
                calls.opens.push(feedOptions);
              },
              close() {
                calls.closes += 1;
              },
            },
          },
    store: {
      get: () => state.token,
      update(token) {
        state.token = token;
        calls.updates.push(token);
      },
      delete() {
        state.token = null;
        calls.deletes += 1;
      },
    },
    broadcasterId: "broadcasterId" in options ? options.broadcasterId : "68710381",
    onEvent: (event) => calls.events.push(event),
    clock: () => state.now,
    schedule(callback, ms) {
      const timer = { at: state.now + ms, callback, isCancelled: false };
      timers.push(timer);
      return () => {
        timer.isCancelled = true;
      };
    },
    createState: () => {
      state.nextState += 1;
      return `state-${state.nextState}`;
    },
    log: (line) => logs.push(line),
  });
  const flush = async () => {
    for (let turn = 0; turn < 12; turn += 1) await Promise.resolve();
  };
  const advance = async (ms: number) => {
    state.now += ms;
    for (const timer of timers.filter(({ at, isCancelled }) => at <= state.now && !isCancelled)) {
      timer.isCancelled = true;
      timer.callback();
    }
    await flush();
  };
  const query = (overrides: Partial<LoginQuery> = {}): LoginQuery => ({
    code: "CODE-1",
    state: "state-1",
    error: null,
    ...overrides,
  });
  return {
    connection,
    state,
    calls,
    logs,
    flush,
    advance,
    query,
    pending: () => timers.filter(({ isCancelled }) => !isCancelled).length,
    feed: () => {
      const last = calls.opens.at(-1);
      if (!last) throw new Error("le flux n'est pas ouvert");
      return last;
    },
  };
};

describe("sans les identifiants de l'application Twitch", () => {
  it("est indisponible : ni connexion ni flux, et rien ne plante", async () => {
    const { connection, calls } = setup({ isAvailable: false });
    await connection.start();
    expect(connection.getStatus()).toEqual({ kind: "unavailable" });
    expect(connection.beginLogin()).toEqual({
      ok: false,
      message: "TWITCH_CLIENT_ID et TWITCH_CLIENT_SECRET manquent dans .env.",
    });
    const result = await connection.completeLogin({ code: "x", state: "y", error: null });
    expect(result.ok).toBe(false);
    await connection.disconnect();
    connection.stop();
    expect(calls.opens).toEqual([]);
  });
});

describe("au démarrage", () => {
  it("sans jeton : non connecté, et le journal dit une fois que les follows attendent", async () => {
    const { connection, logs, calls } = setup();
    await connection.start();
    expect(connection.getStatus()).toEqual({ kind: "disconnected", lastError: null });
    expect(logs).toEqual([
      "Twitch : pas encore connecté, les follows attendent (onglet Renard, « Se connecter à Twitch »).",
    ]);
    expect(calls.opens).toEqual([]);
  });

  it("avec un jeton gardé : connecté en tant que son compte, le flux des follows s'ouvre pour la chaîne et ce modérateur", async () => {
    const { connection, logs, feed } = setup({ token: storedToken });
    await connection.start();
    expect(connection.getStatus()).toEqual({ kind: "connected", login: "fenysk", missing: [] });
    expect(logs).toEqual([
      "Twitch : connecté en tant que fenysk, les follows, les récompenses de points de chaîne et les prédictions sont écoutés.",
    ]);
    expect(feed().broadcasterId).toBe("68710381");
    expect(feed().moderatorId).toBe("68710381");
    expect(feed().topics).toEqual(["follow", "reward", "prediction"]);
  });

  it("transmet chaque évènement du flux (un follow, une récompense) à la suite", async () => {
    const { connection, feed, calls } = setup({ token: storedToken });
    await connection.start();
    feed().onEvent({ kind: "follow", user: "Alice" });
    feed().onEvent({ kind: "reward", user: "Bob", title: "Clasher Fenysk" });
    feed().onEvent({ kind: "prediction", losers: 3, outcome: "Oui" });
    expect(calls.events).toEqual([
      { kind: "follow", user: "Alice" },
      { kind: "reward", user: "Bob", title: "Clasher Fenysk" },
      { kind: "prediction", losers: 3, outcome: "Oui" },
    ]);
  });

  it("avec un jeton d'avant les récompenses : les follows seuls sont écoutés, et le journal dit une fois de se reconnecter", async () => {
    const { connection, logs, feed } = setup({ token: { ...storedToken, scope: FOLLOWS_ONLY } });
    await connection.start();
    expect(feed().topics).toEqual(["follow"]);
    expect(connection.getStatus()).toEqual({
      kind: "connected",
      login: "fenysk",
      missing: ["reward", "prediction"],
    });
    expect(logs).toEqual([
      "Twitch : connecté en tant que fenysk, les follows sont écoutés.",
      "Twitch : le jeton n'a pas le droit de voir les récompenses de points de chaîne et les prédictions : reconnecte-toi depuis l'onglet Renard.",
    ]);
  });

  it("avec un jeton d'avant les prédictions : les follows et les récompenses sont écoutés, et le journal dit de se reconnecter", async () => {
    const { connection, logs, feed } = setup({ token: { ...storedToken, scope: WITHOUT_PREDICTIONS } });
    await connection.start();
    expect(feed().topics).toEqual(["follow", "reward"]);
    expect(connection.getStatus()).toEqual({ kind: "connected", login: "fenysk", missing: ["prediction"] });
    expect(logs).toEqual([
      "Twitch : connecté en tant que fenysk, les follows et les récompenses de points de chaîne sont écoutés.",
      "Twitch : le jeton n'a pas le droit de voir les prédictions : reconnecte-toi depuis l'onglet Renard.",
    ]);
  });

  it("ne répète pas le manque de droit à chaque lecture de l'état", async () => {
    const { connection, logs } = setup({ token: { ...storedToken, scope: FOLLOWS_ONLY } });
    await connection.start();
    const before = logs.length;
    connection.getStatus();
    connection.getStatus();
    expect(logs).toHaveLength(before);
  });

  it("n'ouvre pas le flux d'un jeton sans aucun droit utile, et le dit", async () => {
    const { connection, logs, calls } = setup({ token: { ...storedToken, scope: "chat:read" } });
    await connection.start();
    expect(calls.opens).toEqual([]);
    expect(connection.getStatus()).toEqual({
      kind: "connected",
      login: "fenysk",
      missing: ["follow", "reward", "prediction"],
    });
    expect(logs.some((line) => line.includes("reconnecte-toi"))).toBe(true);
  });

  it("n'ouvre pas le flux sans identifiant de chaîne, et le dit", async () => {
    const { connection, logs, calls } = setup({ token: storedToken, broadcasterId: undefined });
    await connection.start();
    expect(calls.opens).toEqual([]);
    expect(logs.some((line) => line.includes("chatChannelId"))).toBe(true);
  });
});

describe("beginLogin : l'adresse d'autorisation", () => {
  it("demande les droits des follows, des récompenses et des prédictions pour cette application, avec le retour exact et un state neuf", () => {
    const { connection } = setup();
    const result = connection.beginLogin();
    if (!result.ok) throw new Error("beginLogin a échoué");
    const url = new URL(result.url);
    expect(url.origin + url.pathname).toBe("https://id.twitch.tv/oauth2/authorize");
    expect(url.searchParams.get("client_id")).toBe("mon-client");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:4747/auth/twitch/callback");
    expect(url.searchParams.get("scope")).toBe(SCOPE);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-1");
  });

  it("donne un state différent à chaque demande", () => {
    const { connection } = setup();
    const first = connection.beginLogin();
    const second = connection.beginLogin();
    if (!first.ok || !second.ok) throw new Error("beginLogin a échoué");
    expect(new URL(first.url).searchParams.get("state")).not.toBe(
      new URL(second.url).searchParams.get("state"),
    );
  });
});

describe("completeLogin : le retour de Twitch", () => {
  it("échange le code, garde le jeton, ouvre le flux et passe connecté", async () => {
    const { connection, calls, state, query, feed, logs } = setup();
    connection.beginLogin();
    const result = await connection.completeLogin(query());
    expect(result).toEqual({ ok: true, login: "fenysk" });
    expect(calls.exchange).toEqual(["CODE-1"]);
    expect(calls.identity).toEqual(["ACCESS-1"]);
    expect(state.token).toEqual({
      accessToken: "ACCESS-1",
      refreshToken: "REFRESH-1",
      expiresAt: START + 14_400_000,
      login: "fenysk",
      userId: "68710381",
      scope: SCOPE,
    });
    expect(connection.getStatus()).toEqual({ kind: "connected", login: "fenysk", missing: [] });
    expect(feed().moderatorId).toBe("68710381");
    expect(feed().topics).toEqual(["follow", "reward", "prediction"]);
    expect(logs).toContain("Twitch : connecté en tant que fenysk.");
  });

  it("n'accepte un state qu'une fois", async () => {
    const { connection, query, calls } = setup();
    connection.beginLogin();
    await connection.completeLogin(query());
    const again = await connection.completeLogin(query());
    expect(again.ok).toBe(false);
    expect(calls.exchange).toHaveLength(1);
  });

  it("refuse un state inconnu sans rien demander à Twitch (faux retour)", async () => {
    const { connection, query, calls, state } = setup();
    connection.beginLogin();
    const result = await connection.completeLogin(query({ state: "state-inconnu" }));
    expect(result).toEqual({ ok: false, message: "retour de Twitch inconnu ou trop ancien, recommence" });
    expect(await connection.completeLogin(query({ state: null }))).toMatchObject({ ok: false });
    expect(calls.exchange).toEqual([]);
    expect(state.token).toBeNull();
  });

  it("refuse un state de plus de 10 min", async () => {
    const { connection, query, advance, calls } = setup();
    connection.beginLogin();
    await advance(10 * 60_000);
    const result = await connection.completeLogin(query());
    expect(result.ok).toBe(false);
    expect(calls.exchange).toEqual([]);
  });

  it("ne garde que les 5 derniers state en attente : le plus ancien est oublié", async () => {
    const { connection, query, calls } = setup();
    for (let index = 0; index < 6; index += 1) connection.beginLogin();
    const oldest = await connection.completeLogin(query({ state: "state-1" }));
    expect(oldest.ok).toBe(false);
    const newest = await connection.completeLogin(query({ state: "state-6" }));
    expect(newest.ok).toBe(true);
    expect(calls.exchange).toEqual(["CODE-1"]);
  });

  it("dit une autorisation refusée sur Twitch (access_denied), et la garde comme dernière erreur", async () => {
    const { connection, query, logs } = setup();
    connection.beginLogin();
    const result = await connection.completeLogin(query({ code: null, error: "access_denied" }));
    expect(result).toEqual({ ok: false, message: "autorisation refusée sur Twitch" });
    expect(connection.getStatus()).toEqual({
      kind: "disconnected",
      lastError: "Connexion à Twitch échouée : autorisation refusée sur Twitch.",
    });
    expect(logs).toContain("Twitch : connexion échouée (autorisation refusée sur Twitch).");
  });

  it("n'écrit dans le journal qu'un code d'erreur court, jamais le texte d'une adresse piégée", async () => {
    const { connection, query, logs } = setup();
    await connection.completeLogin(query({ code: null, error: "<script>SECRET</script>" }));
    expect(logs.join("\n")).not.toContain("SECRET");
    await connection.completeLogin(query({ code: null, error: "server_error" }));
    expect(logs.some((line) => line.includes("Twitch a refusé (server_error)"))).toBe(true);
  });

  it("refuse un retour sans code", async () => {
    const { connection, query, calls } = setup();
    connection.beginLogin();
    const result = await connection.completeLogin(query({ code: null }));
    expect(result).toEqual({ ok: false, message: "Twitch n'a pas donné de code" });
    expect(calls.exchange).toEqual([]);
  });

  it("n'enregistre rien quand Twitch refuse le code, et le dit sans le code", async () => {
    const { connection, query, state, logs } = setup();
    state.exchange = refusal("HTTP 400 : Invalid authorization code");
    connection.beginLogin();
    const result = await connection.completeLogin(query());
    expect(result.ok).toBe(false);
    expect(state.token).toBeNull();
    expect(connection.getStatus().kind).toBe("disconnected");
    expect(logs.join("\n")).not.toContain("CODE-1");
  });

  it("n'enregistre rien quand le compte est illisible", async () => {
    const { connection, query, state } = setup();
    state.identity = outage("illisible");
    connection.beginLogin();
    expect((await connection.completeLogin(query())).ok).toBe(false);
    expect(state.token).toBeNull();
  });

  it("n'enregistre rien quand Twitch n'a pas donné le droit de voir les follows", async () => {
    const { connection, query, state, calls } = setup();
    state.identity = ok({ login: "fenysk", userId: "68710381", scope: "chat:read" });
    connection.beginLogin();
    const result = await connection.completeLogin(query());
    expect(result.ok).toBe(false);
    expect(state.token).toBeNull();
    expect(calls.opens).toEqual([]);
  });

  it("efface la dernière erreur à la demande suivante", async () => {
    const { connection, query } = setup();
    await connection.completeLogin(query({ code: null, error: "access_denied" }));
    connection.beginLogin();
    expect(connection.getStatus()).toEqual({ kind: "disconnected", lastError: null });
  });

  it("reconnecter un compte déjà connecté ferme l'ancien flux avant d'ouvrir le nouveau", async () => {
    const { connection, query, calls } = setup({ token: storedToken });
    await connection.start();
    connection.beginLogin();
    await connection.completeLogin(query());
    expect(calls.opens).toHaveLength(2);
    expect(calls.closes).toBe(2);
  });
});

describe("le jeton d'accès, renouvelé tout seul", () => {
  it("rend le jeton gardé tant qu'il vaut plus d'une minute, sans rien demander à Twitch", async () => {
    const { connection, feed, calls } = setup({ token: storedToken });
    await connection.start();
    expect(await feed().getAccessToken(false)).toBe("ACCESS-STORED");
    expect(calls.refresh).toEqual([]);
  });

  it("le renouvelle une minute avant sa fin, garde les nouveaux jetons (Twitch en change) et la nouvelle fin", async () => {
    const { connection, feed, calls, state, advance } = setup({ token: storedToken });
    await connection.start();
    await advance(3_600_000 - 60_000);
    expect(await feed().getAccessToken(false)).toBe("ACCESS-R1");
    expect(calls.refresh).toEqual(["REFRESH-STORED"]);
    expect(state.token).toMatchObject({
      accessToken: "ACCESS-R1",
      refreshToken: "REFRESH-R1",
      login: "fenysk",
      userId: "68710381",
      expiresAt: START + 3_600_000 - 60_000 + 14_400_000,
    });
    expect(await feed().getAccessToken(false)).toBe("ACCESS-R1");
    expect(calls.refresh).toHaveLength(1);
  });

  it("renouvelle même un jeton frais quand Twitch vient de le refuser (forcé)", async () => {
    const { connection, feed, calls } = setup({ token: storedToken });
    await connection.start();
    expect(await feed().getAccessToken(true)).toBe("ACCESS-R1");
    expect(calls.refresh).toEqual(["REFRESH-STORED"]);
  });

  it("partage un seul renouvellement entre deux demandes en même temps", async () => {
    const { connection, feed, calls, state, flush } = setup({ token: storedToken });
    await connection.start();
    let open: () => void = () => undefined;
    state.refreshGate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const first = feed().getAccessToken(true);
    const second = feed().getAccessToken(true);
    await flush();
    open();
    expect(await Promise.all([first, second])).toEqual(["ACCESS-R1", "ACCESS-R1"]);
    expect(calls.refresh).toHaveLength(1);
  });

  it("perd la connexion quand Twitch refuse le renouvellement : jeton effacé, flux fermé, déconnecté, et le dit", async () => {
    const { connection, feed, calls, state, logs } = setup({ token: storedToken });
    await connection.start();
    state.refreshResults.push(refusal("HTTP 400 : Invalid refresh token"));
    expect(await feed().getAccessToken(true)).toBeNull();
    expect(state.token).toBeNull();
    expect(calls.deletes).toBe(1);
    expect(connection.getStatus()).toEqual({
      kind: "disconnected",
      lastError: "La connexion à Twitch a expiré : reconnecte-toi.",
    });
    expect(logs.some((line) => line.includes("connexion perdue") && line.includes("reconnecte-toi"))).toBe(
      true,
    );
    expect(calls.closes).toBeGreaterThanOrEqual(1);
  });

  it("garde le jeton quand Twitch ne répond pas, et réessaiera", async () => {
    const { connection, feed, state, calls, logs } = setup({ token: storedToken });
    await connection.start();
    state.refreshResults.push(outage("réseau"));
    expect(await feed().getAccessToken(true)).toBeNull();
    expect(state.token).toEqual(storedToken);
    expect(calls.deletes).toBe(0);
    expect(connection.getStatus().kind).toBe("connected");
    expect(logs.some((line) => line.includes("jeton non renouvelé"))).toBe(true);
  });

  it("ne rend aucun jeton sans connexion", async () => {
    const { connection, feed, query } = setup();
    connection.beginLogin();
    await connection.completeLogin(query());
    await connection.disconnect();
    expect(await feed().getAccessToken(false)).toBeNull();
  });
});

describe("la vérification de chaque heure", () => {
  // Un jeton qui vaut encore 10 h : la vérification de l'heure ne le renouvelle pas d'elle-même.
  const longToken: TwitchToken = { ...storedToken, expiresAt: START + 36_000_000 };

  it("vérifie le compte derrière le jeton toutes les heures, et recommence", async () => {
    const { connection, calls, advance, pending } = setup({ token: longToken });
    await connection.start();
    expect(pending()).toBe(1);
    await advance(3_599_999);
    expect(calls.identity).toEqual([]);
    await advance(1);
    expect(calls.identity).toEqual(["ACCESS-STORED"]);
    expect(pending()).toBe(1);
    await advance(3_600_000);
    expect(calls.identity).toHaveLength(2);
  });

  it("renouvelle le jeton quand Twitch dit qu'il n'est plus valable", async () => {
    const { connection, calls, state, advance } = setup({ token: longToken });
    await connection.start();
    state.identity = refusal("HTTP 401 : invalid access token");
    await advance(3_600_000);
    expect(calls.refresh).toEqual(["REFRESH-STORED"]);
    expect(state.token?.accessToken).toBe("ACCESS-R1");
  });

  it("ne renouvelle rien quand le compte est confirmé", async () => {
    const { connection, calls, advance } = setup({ token: longToken });
    await connection.start();
    await advance(3_600_000);
    expect(calls.refresh).toEqual([]);
  });

  it("s'arrête avec la connexion : plus rien de programmé", async () => {
    const { connection, pending } = setup({ token: storedToken });
    await connection.start();
    connection.stop();
    expect(pending()).toBe(0);
  });
});

describe("disconnect", () => {
  it("efface le jeton, ferme le flux, retire le jeton chez Twitch et passe déconnecté", async () => {
    const { connection, calls, state, logs, pending } = setup({ token: storedToken });
    await connection.start();
    await connection.disconnect();
    expect(state.token).toBeNull();
    expect(calls.revoke).toEqual(["ACCESS-STORED"]);
    expect(calls.closes).toBeGreaterThanOrEqual(1);
    expect(connection.getStatus()).toEqual({ kind: "disconnected", lastError: null });
    expect(logs).toContain("Twitch : déconnecté, jeton retiré.");
    expect(pending()).toBe(0);
  });

  it("se déconnecte quand même si Twitch ne retire pas le jeton, et le dit", async () => {
    const { connection, state, logs } = setup({ token: storedToken });
    await connection.start();
    state.revoke = outage("réseau");
    await connection.disconnect();
    expect(connection.getStatus().kind).toBe("disconnected");
    expect(logs).toContain("Twitch : déconnecté, mais Twitch n'a pas retiré le jeton (réseau).");
  });

  it("ne fait rien quand personne n'est connecté", async () => {
    const { connection, calls } = setup();
    await connection.disconnect();
    expect(calls.revoke).toEqual([]);
    expect(calls.deletes).toBe(0);
  });
});

describe("rien de secret dans le journal", () => {
  it("ni jeton d'accès, ni jeton de renouvellement, ni code, dans tout un parcours", async () => {
    const { connection, query, feed, state, logs, advance } = setup();
    connection.beginLogin();
    await connection.completeLogin(query());
    await feed().getAccessToken(true);
    state.refreshResults.push(refusal("HTTP 400 : Invalid refresh token"));
    await advance(3_600_000);
    await connection.disconnect();
    const text = logs.join("\n");
    for (const secret of ["ACCESS-1", "REFRESH-1", "ACCESS-R", "REFRESH-R", "CODE-1"]) {
      expect(text).not.toContain(secret);
    }
    expect(text.length).toBeGreaterThan(0);
  });
});
