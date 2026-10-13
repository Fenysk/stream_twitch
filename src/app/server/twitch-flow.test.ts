import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTwitchAuthClient } from "../../infra/twitch-auth.client";
import { createFollowFeed } from "../../infra/twitch-follows.client";
import { createTwitchTokenStore } from "../../infra/twitch-token.repository";
import { createTwitchConnection } from "../../usecase/twitch-connection.usecase";
import {
  FAKE_CLIENT_ID,
  FAKE_CODE,
  FAKE_SECRET,
  type FakeTwitch,
  startFakeTwitch,
} from "./fake-twitch.testkit";

let fake: FakeTwitch;
let directory = "";
let tokenPath = "";

beforeEach(async () => {
  fake = await startFakeTwitch();
  directory = mkdtempSync(join(tmpdir(), "twitch-flow-"));
  tokenPath = join(directory, "data", "twitch-token.json");
});

afterEach(async () => {
  await fake.stop();
  rmSync(directory, { recursive: true, force: true });
});

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Attend, par de vrais échanges réseau sur 127.0.0.1, que la condition soit vraie.
const waitFor = async (isDone: () => boolean, what: string): Promise<void> => {
  for (let turn = 0; turn < 400; turn += 1) {
    if (isDone()) return;
    await sleep(5);
  }
  throw new Error(`jamais arrivé : ${what}`);
};

// Le serveur câblé comme runtime.ts le fait (jeton en fichier, client d'authentification, flux EventSub), mais contre le faux
// Twitch et avec un temps à la main : l'horloge du jeton et les minuteurs avancent quand le test le dit.
const startStack = () => {
  const sim = { now: Date.now(), nextState: 0 };
  const timers: { at: number; callback: () => void; isCancelled: boolean }[] = [];
  const logs: string[] = [];
  const follows: string[] = [];
  const schedule = (callback: () => void, ms: number) => {
    const timer = { at: sim.now + ms, callback, isCancelled: false };
    timers.push(timer);
    return () => {
      timer.isCancelled = true;
    };
  };
  const connection = createTwitchConnection({
    app: {
      clientId: FAKE_CLIENT_ID,
      auth: createTwitchAuthClient({
        clientId: FAKE_CLIENT_ID,
        clientSecret: FAKE_SECRET,
        idUrl: fake.httpUrl,
      }),
      feed: createFollowFeed({
        clientId: FAKE_CLIENT_ID,
        schedule,
        log: (line) => logs.push(line),
        socketUrl: fake.socketUrl,
        apiUrl: fake.httpUrl,
      }),
    },
    store: createTwitchTokenStore(tokenPath, (line) => logs.push(line)),
    broadcasterId: "68710381",
    onFollow: (nickname) => follows.push(nickname),
    clock: () => sim.now,
    schedule,
    createState: () => {
      sim.nextState += 1;
      return `state-${sim.nextState}`;
    },
    log: (line) => logs.push(line),
  });
  const advance = async (ms: number) => {
    sim.now += ms;
    for (const timer of timers.filter(({ at, isCancelled }) => at <= sim.now && !isCancelled)) {
      timer.isCancelled = true;
      timer.callback();
    }
    await sleep(0);
  };
  // Le faux Twitch coupe les connexions EventSub ; on attend que le flux l'ait vu (et programmé sa nouvelle tentative).
  const breakSockets = async () => {
    const before = logs.filter((line) => line.includes("interrompu")).length;
    fake.breakSockets();
    await waitFor(
      () => logs.filter((line) => line.includes("interrompu")).length > before,
      "la coupure vue par le flux",
    );
  };
  // Alexis autorise sur Twitch : le navigateur revient avec le code et le state de la demande.
  const login = async (code = FAKE_CODE) => {
    const begun = connection.beginLogin();
    if (!begun.ok) throw new Error(begun.message);
    const state = new URL(begun.url).searchParams.get("state");
    return { begun, result: await connection.completeLogin({ code, state, error: null }) };
  };
  return { connection, sim, logs, follows, advance, breakSockets, login };
};

const getSavedToken = (): Record<string, unknown> => JSON.parse(readFileSync(tokenPath, "utf8"));

describe("la connexion à Twitch, de bout en bout contre un faux Twitch", () => {
  it("autorise, garde le jeton, s'abonne par EventSub et reçoit un follow", async () => {
    const { connection, logs, follows, login } = startStack();
    await connection.start();
    expect(connection.getStatus()).toEqual({ kind: "disconnected", lastError: null });
    expect(logs).toEqual([
      "Twitch : pas encore connecté, les follows attendent (onglet Renard, « Se connecter à Twitch »).",
    ]);

    const { begun, result } = await login();
    const authorize = new URL(begun.url);
    expect(authorize.origin + authorize.pathname).toBe("https://id.twitch.tv/oauth2/authorize");
    expect(authorize.searchParams.get("redirect_uri")).toBe("http://localhost:4747/auth/twitch/callback");
    expect(authorize.searchParams.get("scope")).toBe("moderator:read:followers");
    expect(result).toEqual({ ok: true, login: "fenysk" });
    expect(connection.getStatus()).toEqual({ kind: "connected", login: "fenysk" });

    // Le jeton est gardé dans data/twitch-token.json.
    const saved = getSavedToken();
    expect(saved.accessToken).toBe("fake-access-1");
    expect(saved.refreshToken).toBe("fake-refresh-1");
    expect(saved.login).toBe("fenysk");
    expect(saved.userId).toBe("68710381");

    // Le flux s'abonne : channel.follow v2, la chaîne et le modérateur, avec le jeton.
    await waitFor(() => fake.subscriptions() === 1, "l'abonnement EventSub");
    const [subscription] = fake.requestsTo("/helix/eventsub/subscriptions");
    expect(subscription?.headers.authorization).toBe("Bearer fake-access-1");
    expect(subscription?.headers["client-id"]).toBe(FAKE_CLIENT_ID);
    const body: Record<string, unknown> = JSON.parse(subscription?.body ?? "{}");
    expect(body.type).toBe("channel.follow");
    expect(body.version).toBe("2");
    expect(body.condition).toEqual(
      JSON.parse('{"broadcaster_user_id":"68710381","moderator_user_id":"68710381"}'),
    );
    expect(body.transport).toEqual(JSON.parse('{"method":"websocket","session_id":"fake-session-1"}'));

    // Un follow arrive par EventSub.
    fake.sendFollow("Alice");
    await waitFor(() => follows.length === 1, "le follow d'Alice");
    expect(follows).toEqual(["Alice"]);
    connection.stop();
  });

  it("échange le code avec le secret de l'application et l'adresse de retour exacte", async () => {
    const { connection, login } = startStack();
    await connection.start();
    await login();
    const [exchange] = fake.requestsTo("/oauth2/token");
    const form = new URLSearchParams(exchange?.body);
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code")).toBe(FAKE_CODE);
    expect(form.get("client_secret")).toBe(FAKE_SECRET);
    expect(form.get("redirect_uri")).toBe("http://localhost:4747/auth/twitch/callback");
    connection.stop();
  });

  it("renouvelle le jeton à la reconnexion quand il est près de sa fin : nouveaux jetons gardés, abonnement refait avec eux", async () => {
    fake.setLifetime(3600);
    const { connection, follows, sim, advance, breakSockets, login } = startStack();
    await connection.start();
    await login();
    await waitFor(() => fake.subscriptions() === 1, "le premier abonnement");

    // Le jeton vaut encore 30 s ; la connexion tombe, le flux se rouvre et demande un jeton valable.
    sim.now += 3600 * 1000 - 30_000;
    await breakSockets();
    await advance(5000);
    await waitFor(() => fake.subscriptions() === 2, "le nouvel abonnement");

    expect(fake.accessTokens).toEqual(["fake-access-1", "fake-access-2"]);
    const refresh = new URLSearchParams(fake.requestsTo("/oauth2/token").at(-1)?.body);
    expect(refresh.get("grant_type")).toBe("refresh_token");
    expect(refresh.get("refresh_token")).toBe("fake-refresh-1");
    expect(refresh.get("client_secret")).toBe(FAKE_SECRET);
    expect(fake.requestsTo("/helix/eventsub/subscriptions").at(-1)?.headers.authorization).toBe(
      "Bearer fake-access-2",
    );
    expect(getSavedToken()).toMatchObject({
      accessToken: "fake-access-2",
      refreshToken: "fake-refresh-2",
      login: "fenysk",
      userId: "68710381",
    });

    fake.sendFollow("Bob");
    await waitFor(() => follows.length === 1, "le follow de Bob");
    expect(follows).toEqual(["Bob"]);
    connection.stop();
  });

  it("reprend sans nouvelle autorisation au redémarrage du serveur : le jeton gardé suffit", async () => {
    const first = startStack();
    await first.connection.start();
    await first.login();
    await waitFor(() => fake.subscriptions() === 1, "le premier abonnement");
    first.connection.stop();
    await waitFor(() => fake.sockets() === 0, "la fermeture");

    const second = startStack();
    await second.connection.start();
    expect(second.connection.getStatus()).toEqual({ kind: "connected", login: "fenysk" });
    await waitFor(() => fake.subscriptions() === 2, "l'abonnement après redémarrage");
    fake.sendFollow("Carl");
    await waitFor(() => second.follows.length === 1, "le follow de Carl");
    expect(second.follows).toEqual(["Carl"]);
    expect(fake.requestsTo("/oauth2/token")).toHaveLength(1);
    second.connection.stop();
  });

  it("perd la connexion quand Twitch refuse le renouvellement : jeton effacé, déconnecté, plus de flux", async () => {
    fake.setLifetime(3600);
    const { connection, logs, sim, advance, breakSockets, login } = startStack();
    await connection.start();
    await login();
    await waitFor(() => fake.subscriptions() === 1, "le premier abonnement");

    fake.revokeEverything();
    sim.now += 3600 * 1000;
    await breakSockets();
    await advance(5000);
    await waitFor(() => connection.getStatus().kind === "disconnected", "la perte de la connexion");

    expect(existsSync(tokenPath)).toBe(false);
    expect(connection.getStatus()).toEqual({
      kind: "disconnected",
      lastError: "La connexion à Twitch a expiré : reconnecte-toi.",
    });
    expect(logs.some((line) => line.includes("connexion perdue"))).toBe(true);
    await advance(120_000);
    expect(fake.subscriptions()).toBe(1);
  });

  it("se déconnecte : fichier effacé, jeton révoqué chez Twitch, connexion EventSub fermée", async () => {
    const { connection, login } = startStack();
    await connection.start();
    await login();
    await waitFor(() => fake.subscriptions() === 1, "le premier abonnement");
    await connection.disconnect();
    expect(existsSync(tokenPath)).toBe(false);
    expect(connection.getStatus()).toEqual({ kind: "disconnected", lastError: null });
    const [revoke] = fake.requestsTo("/oauth2/revoke");
    expect(new URLSearchParams(revoke?.body).get("token")).toBe("fake-access-1");
    await waitFor(() => fake.sockets() === 0, "la fermeture du flux");
  });

  it("refuse un retour au state inconnu sans rien demander à Twitch", async () => {
    const { connection } = startStack();
    await connection.start();
    connection.beginLogin();
    const result = await connection.completeLogin({ code: FAKE_CODE, state: "state-forge", error: null });
    expect(result.ok).toBe(false);
    expect(fake.requestsTo("/oauth2/token")).toEqual([]);
    expect(existsSync(tokenPath)).toBe(false);
  });

  it("garde la raison quand Twitch refuse le code, sans jeton ni fichier", async () => {
    const { connection, login } = startStack();
    await connection.start();
    const { result } = await login("MAUVAIS-CODE");
    expect(result).toEqual({ ok: false, message: "code refusé (HTTP 400 : Invalid authorization code)" });
    expect(connection.getStatus()).toEqual({
      kind: "disconnected",
      lastError: "Connexion à Twitch échouée : code refusé (HTTP 400 : Invalid authorization code).",
    });
    expect(existsSync(tokenPath)).toBe(false);
    expect(fake.sockets()).toBe(0);
  });

  it("n'écrit jamais un jeton, un code ni le secret dans le journal, tout au long du parcours", async () => {
    fake.setLifetime(3600);
    const { connection, logs, sim, advance, breakSockets, login } = startStack();
    await connection.start();
    await login("MAUVAIS-CODE");
    await login();
    await waitFor(() => fake.subscriptions() === 1, "le premier abonnement");
    sim.now += 3600 * 1000 - 30_000;
    await breakSockets();
    await advance(5000);
    await waitFor(() => fake.subscriptions() === 2, "le second abonnement");
    await connection.disconnect();
    const text = logs.join("\n");
    expect(text.length).toBeGreaterThan(0);
    for (const secret of ["fake-access", "fake-refresh", FAKE_CODE, "MAUVAIS-CODE", FAKE_SECRET]) {
      expect(text).not.toContain(secret);
    }
  });

  it("ne donne aux pages que l'état, jamais le jeton", async () => {
    const { connection, login } = startStack();
    await connection.start();
    await login();
    const status = JSON.stringify(connection.getStatus());
    expect(status).toBe('{"kind":"connected","login":"fenysk"}');
    expect(status).not.toContain("fake-access");
    connection.stop();
  });
});
