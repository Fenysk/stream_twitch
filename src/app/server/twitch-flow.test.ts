import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toInsultList } from "../../domain/chat-insults.rules";
import type { SoundEvent } from "../../domain/sound.schema";
import { isFoxReward } from "../../domain/thanks.rules";
import { createRewardPhraseStore } from "../../infra/reward-phrase.repository";
import { createSoundStore } from "../../infra/sound.repository";
import { createTwitchAuthClient } from "../../infra/twitch-auth.client";
import { createEventFeed } from "../../infra/twitch-events.client";
import { createRewardsClient } from "../../infra/twitch-rewards.client";
import { createTwitchTokenStore } from "../../infra/twitch-token.repository";
import type { QueueItem } from "../../usecase/fox-queue.usecase";
import { createFoxReward } from "../../usecase/fox-reward.usecase";
import { createRewardPhraseLibrary } from "../../usecase/reward-phrase.usecase";
import { createSoundLibrary } from "../../usecase/sound.usecase";
import { createSoundQueue } from "../../usecase/sound-queue.usecase";
import { createTwitchConnection } from "../../usecase/twitch-connection.usecase";
import {
  FAKE_CLIENT_ID,
  FAKE_CODE,
  FAKE_SECRET,
  type FakeTwitch,
  startFakeTwitch,
} from "./fake-twitch.testkit";

// Les récompenses que le renard reconnaît par leur titre : leurs phrases se règlent dans l'onglet Renard.
const FOX_REWARDS = { foxClashRewards: ["Clasher Fenysk"], foxWakeRewards: ["Réveiller Jean-Renard"] };
const isReserved = (title: string): boolean => isFoxReward(title, FOX_REWARDS);

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
  const rewards: { user: string; title: string }[] = [];
  const predictions: { losers: number; outcome: string | null }[] = [];
  const schedule = (callback: () => void, ms: number) => {
    const timer = { at: sim.now + ms, callback, isCancelled: false };
    timers.push(timer);
    return () => {
      timer.isCancelled = true;
    };
  };
  // La soundboard câblée comme runtime.ts le fait : les sons sur disque, leurs rewards chez Twitch, la queue vers la page /sounds.
  const twitchRewards = createRewardsClient({
    clientId: FAKE_CLIENT_ID,
    broadcasterId: "68710381",
    getAccessToken: (isForced) => connection.getRewardsToken(isForced),
    apiUrl: fake.httpUrl,
  });
  const soundStore = createSoundStore(join(directory, "data", "sounds"), (line) => logs.push(line));
  let soundIds = 0;
  const library = createSoundLibrary({
    store: soundStore,
    rewards: twitchRewards,
    createId: () => {
      soundIds += 1;
      return `sound00${soundIds}`;
    },
    onDelete: (id) => queue.forget(id),
    log: (line) => logs.push(line),
  });
  let playIds = 0;
  const queue = createSoundQueue({
    library,
    rewards: twitchRewards,
    createId: () => {
      playIds += 1;
      return `play${playIds}`;
    },
    schedule,
    log: (line) => logs.push(line),
  });
  // Les phrases de Jean-Renard par récompense, sur le même disque. Sa file garde ce qu'on lui pousse : le test dit quand une
  // phrase est finie (`onDone`) ; « Tester » dit la sienne tout de suite.
  const spoken = { queued: [] as QueueItem[], tested: [] as string[] };
  const phrases = createRewardPhraseLibrary({
    store: createRewardPhraseStore(join(directory, "data", "reward-phrases.json"), (line) => logs.push(line)),
    rewards: twitchRewards,
    isReserved,
    log: (line) => logs.push(line),
  });
  const foxReward = createFoxReward({
    queue: { push: (item) => spoken.queued.push(item) },
    mode: {
      async say(text) {
        spoken.tested.push(text);
        return { ok: true, url: "/api/fox/speech/1", durationMs: 1000 };
      },
    },
    sounds: queue,
    phrases,
    jab: { noteActivity: () => undefined },
    insults: toInsultList("connard"),
    isReserved,
    random: () => 0,
    log: (line) => logs.push(line),
  });
  const connection = createTwitchConnection({
    app: {
      clientId: FAKE_CLIENT_ID,
      auth: createTwitchAuthClient({
        clientId: FAKE_CLIENT_ID,
        clientSecret: FAKE_SECRET,
        idUrl: fake.httpUrl,
      }),
      feed: createEventFeed({
        clientId: FAKE_CLIENT_ID,
        schedule,
        log: (line) => logs.push(line),
        socketUrl: fake.socketUrl,
        apiUrl: fake.httpUrl,
      }),
    },
    store: createTwitchTokenStore(tokenPath, (line) => logs.push(line)),
    broadcasterId: "68710381",
    onEvent: (event) => {
      if (event.kind === "follow") follows.push(event.user);
      if (event.kind === "reward") {
        rewards.push({ user: event.user, title: event.title });
        foxReward.redeem(event);
      }
      if (event.kind === "prediction") predictions.push({ losers: event.losers, outcome: event.outcome });
    },
    onReady: () => void library.openRewards(),
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
  // Une page /sounds : tout ce que la queue lui envoie s'empile dans `events`.
  const connectPage = () => {
    const events: SoundEvent[] = [];
    const disconnect = queue.subscribe((event) => events.push(event));
    return { events, disconnect };
  };
  return {
    connection,
    sim,
    logs,
    follows,
    rewards,
    predictions,
    advance,
    breakSockets,
    login,
    library,
    queue,
    connectPage,
    phrases,
    foxReward,
    spoken,
  };
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
    expect(authorize.searchParams.get("scope")).toBe(
      "moderator:read:followers channel:manage:redemptions channel:read:predictions",
    );
    expect(result).toEqual({ ok: true, login: "fenysk" });
    expect(connection.getStatus()).toEqual({ kind: "connected", login: "fenysk", missing: [] });

    // Le jeton est gardé dans data/twitch-token.json.
    const saved = getSavedToken();
    expect(saved.accessToken).toBe("fake-access-1");
    expect(saved.refreshToken).toBe("fake-refresh-1");
    expect(saved.login).toBe("fenysk");
    expect(saved.userId).toBe("68710381");

    // Le flux s'abonne : channel.follow v2, la chaîne et le modérateur, avec le jeton.
    await waitFor(() => fake.subscriptions() === 3, "les abonnements EventSub");
    expect(fake.subscribedTypes()).toEqual([
      "channel.follow",
      "channel.channel_points_custom_reward_redemption.add",
      "channel.prediction.end",
    ]);
    const [subscription, rewardSubscription, predictionSubscription] = fake.requestsTo(
      "/helix/eventsub/subscriptions",
    );
    expect(subscription?.headers.authorization).toBe("Bearer fake-access-1");
    expect(subscription?.headers["client-id"]).toBe(FAKE_CLIENT_ID);
    const body: Record<string, unknown> = JSON.parse(subscription?.body ?? "{}");
    expect(body.type).toBe("channel.follow");
    expect(body.version).toBe("2");
    expect(body.condition).toEqual(
      JSON.parse('{"broadcaster_user_id":"68710381","moderator_user_id":"68710381"}'),
    );
    expect(body.transport).toEqual(JSON.parse('{"method":"websocket","session_id":"fake-session-1"}'));
    // Les récompenses : version 1, la chaîne seulement, avec le même jeton.
    expect(rewardSubscription?.headers.authorization).toBe("Bearer fake-access-1");
    const rewardBody: Record<string, unknown> = JSON.parse(rewardSubscription?.body ?? "{}");
    expect(rewardBody.type).toBe("channel.channel_points_custom_reward_redemption.add");
    expect(rewardBody.version).toBe("1");
    expect(rewardBody.condition).toEqual(JSON.parse('{"broadcaster_user_id":"68710381"}'));
    // Les prédictions terminées : version 1, la chaîne seulement, avec le même jeton.
    expect(predictionSubscription?.headers.authorization).toBe("Bearer fake-access-1");
    const predictionBody: Record<string, unknown> = JSON.parse(predictionSubscription?.body ?? "{}");
    expect(predictionBody.type).toBe("channel.prediction.end");
    expect(predictionBody.version).toBe("1");
    expect(predictionBody.condition).toEqual(JSON.parse('{"broadcaster_user_id":"68710381"}'));

    // Un follow arrive par EventSub.
    fake.sendFollow("Alice");
    await waitFor(() => follows.length === 1, "le follow d'Alice");
    expect(follows).toEqual(["Alice"]);
    connection.stop();
  });

  it("reçoit une récompense de points de chaîne : son titre et son pseudo, jamais le texte que le viewer y joint", async () => {
    const { connection, follows, rewards, logs, login } = startStack();
    await connection.start();
    await login();
    await waitFor(() => fake.subscriptions() === 3, "les abonnements EventSub");
    fake.sendReward("Alice", "Clasher Fenysk", "un texte qui ne doit pas être lu");
    fake.sendReward("Bob", "Réveiller Jean-Renard");
    await waitFor(() => rewards.length === 2, "les deux récompenses");
    expect(rewards).toEqual([
      { user: "Alice", title: "Clasher Fenysk" },
      { user: "Bob", title: "Réveiller Jean-Renard" },
    ]);
    expect(follows).toEqual([]);
    expect(JSON.stringify(rewards)).not.toContain("texte");
    expect(logs.join("\n")).not.toContain("texte");
    connection.stop();
  });

  it("reçoit la fin d'une prédiction : les perdants et l'issue la plus suivie ; une prédiction annulée ne dit rien", async () => {
    const { connection, predictions, login } = startStack();
    await connection.start();
    await login();
    await waitFor(() => fake.subscriptions() === 3, "les abonnements EventSub");
    fake.sendPredictionEnd(
      [
        { title: "Oui", users: 4 },
        { title: "Non", users: 9 },
        { title: "Peut-être", users: 2 },
      ],
      0,
    );
    fake.sendPredictionEnd(
      [
        { title: "Oui", users: 4 },
        { title: "Non", users: 9 },
      ],
      null,
    );
    fake.sendPredictionEnd(
      [
        { title: "Oui", users: 4 },
        { title: "Non", users: 0 },
      ],
      0,
    );
    await waitFor(() => predictions.length === 2, "les deux prédictions résolues");
    expect(predictions).toEqual([
      { losers: 11, outcome: "Non" },
      { losers: 0, outcome: null },
    ]);
    connection.stop();
  });

  it("avec un jeton d'avant les récompenses : les follows marchent, l'état dit de se reconnecter, le journal le dit une fois", async () => {
    fake.setScopes(["moderator:read:followers"]);
    const { connection, follows, logs, login } = startStack();
    await connection.start();
    await login();
    await waitFor(() => fake.subscriptions() === 1, "l'abonnement aux follows");
    expect(fake.subscribedTypes()).toEqual(["channel.follow"]);
    expect(connection.getStatus()).toEqual({
      kind: "connected",
      login: "fenysk",
      missing: ["reward", "prediction"],
    });
    fake.sendFollow("Alice");
    await waitFor(() => follows.length === 1, "le follow d'Alice");
    expect(
      logs.filter((line) =>
        line.includes(
          "le jeton n'a pas le droit de voir les récompenses de points de chaîne et les prédictions",
        ),
      ),
    ).toHaveLength(1);
    connection.stop();
  });

  it("quand Twitch refuse les récompenses, les follows continuent", async () => {
    fake.refuseType("channel.channel_points_custom_reward_redemption.add");
    const { connection, follows, logs, login } = startStack();
    await connection.start();
    await login();
    await waitFor(() => fake.requestsTo("/helix/eventsub/subscriptions").length === 3, "les trois demandes");
    expect(fake.subscribedTypes()).toEqual(["channel.follow", "channel.prediction.end"]);
    await waitFor(
      () => logs.includes("Twitch : abonnement aux récompenses de points de chaîne refusé (HTTP 403)."),
      "le refus des récompenses dit",
    );
    fake.sendFollow("Alice");
    await waitFor(() => follows.length === 1, "le follow d'Alice");
    expect(fake.sockets()).toBe(1);
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
    await waitFor(() => fake.subscriptions() === 3, "les premiers abonnements");

    // Le jeton vaut encore 30 s ; la connexion tombe, le flux se rouvre et demande un jeton valable.
    sim.now += 3600 * 1000 - 30_000;
    await breakSockets();
    await advance(5000);
    await waitFor(() => fake.subscriptions() === 6, "les nouveaux abonnements");

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
    await waitFor(() => fake.subscriptions() === 3, "les premiers abonnements");
    first.connection.stop();
    await waitFor(() => fake.sockets() === 0, "la fermeture");

    const second = startStack();
    await second.connection.start();
    expect(second.connection.getStatus()).toEqual({ kind: "connected", login: "fenysk", missing: [] });
    await waitFor(() => fake.subscriptions() === 6, "les abonnements après redémarrage");
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
    await waitFor(() => fake.subscriptions() === 3, "les premiers abonnements");

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
    expect(fake.subscriptions()).toBe(3);
  });

  it("se déconnecte : fichier effacé, jeton révoqué chez Twitch, connexion EventSub fermée", async () => {
    const { connection, login } = startStack();
    await connection.start();
    await login();
    await waitFor(() => fake.subscriptions() === 3, "les premiers abonnements");
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
    await waitFor(() => fake.subscriptions() === 3, "les premiers abonnements");
    sim.now += 3600 * 1000 - 30_000;
    await breakSockets();
    await advance(5000);
    await waitFor(() => fake.subscriptions() === 6, "les seconds abonnements");
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
    expect(status).toBe('{"kind":"connected","login":"fenysk","missing":[]}');
    expect(status).not.toContain("fake-access");
    connection.stop();
  });
});

const REWARD_TYPE = "channel.channel_points_custom_reward_redemption.add";
// Combien d'abonnements de ce type le faux Twitch a acceptés depuis le début.
const countOf = (type: string): number =>
  fake.subscribedTypes().filter((subscribed) => subscribed === type).length;

const ascii = (text: string): number[] => Array.from(text).map((character) => character.charCodeAt(0));
const wav = (): Uint8Array =>
  Uint8Array.from([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE"), ...new Array(40).fill(3)]);
const fieldsOf = (title: string, overrides: { cost?: number; pace?: number; fader?: number } = {}) => ({
  title,
  cost: 100,
  pace: 30,
  fader: 80,
  ...overrides,
});
const draft = (
  title: string,
  overrides: { cost?: number; pace?: number; fader?: number; rewardId?: string } = {},
) => ({
  ...fieldsOf(title, overrides),
  ...(overrides.rewardId === undefined ? {} : { rewardId: overrides.rewardId }),
  file: wav(),
});

// Connecté, avec un son qui a son reward chez Twitch et une page /sounds ouverte : le point de départ de chaque rachat.
const startSoundboard = async () => {
  const stack = startStack();
  await stack.connection.start();
  await stack.login();
  await waitFor(() => countOf(REWARD_TYPE) === 1, "l'abonnement aux redemptions");
  const created = await stack.library.create(draft("Rire"));
  if (!created.ok) throw new Error("le son n'a pas été créé");
  const [reward] = fake.rewards();
  if (!reward) throw new Error("le reward n'existe pas chez Twitch");
  return { ...stack, reward, page: stack.connectPage() };
};

const getStatusOf = (id: string): string | undefined =>
  fake.redemptions().find((item) => item.id === id)?.status;

describe("les points de chaîne contre le faux Twitch : les rewards des sons", () => {
  it("s'abonne aux redemptions sur la même session que les follows", async () => {
    const { connection, login } = startStack();
    await connection.start();
    await login();
    await waitFor(() => fake.subscriptions() === 3, "les trois abonnements");
    expect(countOf(REWARD_TYPE)).toBe(1);
    expect(fake.subscriptions()).toBe(3);
    expect(fake.sockets()).toBe(1);
    const body: Record<string, unknown> = JSON.parse(
      fake.requestsTo("/helix/eventsub/subscriptions")[1]?.body ?? "{}",
    );
    expect(body.version).toBe("1");
    expect(body.condition).toEqual(JSON.parse('{"broadcaster_user_id":"68710381"}'));
    expect(body.transport).toEqual(JSON.parse('{"method":"websocket","session_id":"fake-session-1"}'));
    connection.stop();
  });

  it("crée le reward d'un son sur Twitch : titre, coût, cooldown global, sans sauter la file", async () => {
    const { reward, library, connection } = await startSoundboard();
    expect(reward).toMatchObject({
      title: "Rire",
      cost: 100,
      cooldownSeconds: 30,
      isPaused: false,
      isSkippingQueue: false,
    });
    expect(library.list()).toMatchObject([{ title: "Rire", hasReward: true }]);
    connection.stop();
  });

  it("n'allume pas de cooldown pour une pace de 0", async () => {
    const { library, connection } = await startSoundboard();
    await library.create(draft("Bravo", { pace: 0, cost: 250 }));
    expect(fake.rewards().find(({ title }) => title === "Bravo")).toMatchObject({
      cost: 250,
      cooldownSeconds: undefined,
    });
    connection.stop();
  });

  it("modifie le reward quand le titre, le coût ou la pace changent, et pas quand seul le volume change", async () => {
    const { library, connection, reward } = await startSoundboard();
    const before = fake.requests.length;
    await library.update("sound001", fieldsOf("Rire", { fader: 10 }));
    expect(fake.requests.length).toBe(before);
    await library.update("sound001", fieldsOf("Fou rire", { cost: 500, pace: 0 }));
    expect(fake.rewards().find(({ id }) => id === reward.id)).toMatchObject({
      title: "Fou rire",
      cost: 500,
      cooldownSeconds: undefined,
    });
    connection.stop();
  });

  it("supprime le reward avec le son", async () => {
    const { library, connection, reward } = await startSoundboard();
    expect((await library.delete("sound001")).ok).toBe(true);
    expect(fake.rewards().some(({ id }) => id === reward.id)).toBe(false);
    expect(library.list()).toEqual([]);
    connection.stop();
  });

  it("recrée le reward qu'Alexis a supprimé à la main sur Twitch", async () => {
    const { library, connection, reward } = await startSoundboard();
    fake.removeReward(reward.id);
    expect((await library.update("sound001", draft("Rire", { cost: 300 }))).ok).toBe(true);
    expect(fake.rewards()).toHaveLength(1);
    expect(fake.rewards()[0]).toMatchObject({ title: "Rire", cost: 300 });
    expect(fake.rewards()[0]?.id).not.toBe(reward.id);
    connection.stop();
  });

  it("dit en clair une chaîne non affiliée, et ne garde aucun son", async () => {
    const stack = startStack();
    await stack.connection.start();
    await stack.login();
    fake.setAffiliate(false);
    const result = await stack.library.create(draft("Rire"));
    expect(result).toEqual({
      ok: false,
      status: 422,
      issues: [
        {
          path: "",
          message:
            "Twitch refuse : la chaîne n'est pas affiliée (les points de chaîne demandent le statut d'affilié ou de partenaire).",
        },
      ],
    });
    expect(stack.library.list()).toEqual([]);
    stack.connection.stop();
  });

  it("dit en clair un titre déjà pris sur la chaîne, et ne garde aucun son", async () => {
    const stack = startStack();
    await stack.connection.start();
    await stack.login();
    fake.addForeignReward("Rire");
    const result = await stack.library.create(draft("Rire"));
    expect(result).toMatchObject({
      ok: false,
      status: 422,
      issues: [{ message: "Twitch refuse ce titre : une récompense de la chaîne le porte déjà." }],
    });
    expect(stack.library.list()).toEqual([]);
    stack.connection.stop();
  });

  it("dit en clair les 50 récompenses atteintes", async () => {
    const stack = startStack();
    await stack.connection.start();
    await stack.login();
    fake.addForeignReward("Déjà là");
    fake.setMaxRewards(1);
    const result = await stack.library.create(draft("Rire"));
    expect(result).toMatchObject({
      ok: false,
      issues: [{ message: "Twitch refuse : la chaîne a déjà 50 récompenses, le maximum. Supprime-en une." }],
    });
    stack.connection.stop();
  });

  it("refuse d'ajouter un son quand Twitch n'est pas connecté", async () => {
    const stack = startStack();
    await stack.connection.start();
    expect(await stack.library.create(draft("Rire"))).toEqual({
      ok: false,
      status: 422,
      issues: [
        {
          path: "",
          message: "Twitch n'est pas prêt : connecte-toi (ou reconnecte-toi) depuis l'onglet Renard.",
        },
      ],
    });
    expect(fake.requestsTo("/helix/channel_points/custom_rewards")).toEqual([]);
  });

  it("dit de se reconnecter avec un jeton d'avant les récompenses : les follows marchent, les rewards attendent", async () => {
    const first = startStack();
    await first.connection.start();
    await first.login();
    await waitFor(() => countOf(REWARD_TYPE) === 1, "le premier abonnement");
    first.connection.stop();
    await waitFor(() => fake.sockets() === 0, "la fermeture");
    writeFileSync(tokenPath, JSON.stringify({ ...getSavedToken(), scope: "moderator:read:followers" }));

    const second = startStack();
    await second.connection.start();
    expect(second.connection.getStatus()).toEqual({
      kind: "connected",
      login: "fenysk",
      missing: ["reward", "prediction"],
    });
    await waitFor(() => fake.subscriptions() === 4, "l'abonnement aux follows");
    fake.sendFollow("Dora");
    await waitFor(() => second.follows.length === 1, "le follow de Dora");
    // Le seul abonnement aux redemptions est celui du premier serveur : le jeton d'avant les récompenses n'en fait pas.
    expect(countOf(REWARD_TYPE)).toBe(1);
    expect(await second.library.create(draft("Rire"))).toMatchObject({ ok: false, status: 422 });
    expect(fake.requestsTo("/helix/channel_points/custom_rewards")).toEqual([]);
    second.connection.stop();
  });
});

describe("les points de chaîne contre le faux Twitch : un rachat joue le son", () => {
  it("joue le son à son volume dans la page, puis garde les points (FULFILLED) quand il a fini", async () => {
    const { reward, page, queue, connection, logs } = await startSoundboard();
    const id = fake.sendRedemption({ rewardId: reward.id, user: "Alice", input: "salut" });
    await waitFor(() => page.events.length === 1, "le son envoyé à la page");
    expect(page.events[0]).toMatchObject({ kind: "play", soundId: "sound001", fader: 80 });
    expect(getStatusOf(id)).toBe("UNFULFILLED");
    queue.finish("play1", "ended");
    await waitFor(() => getStatusOf(id) === "FULFILLED", "les points gardés");
    // Le journal l'écrit une fois la réponse de Twitch lue : un instant après le changement chez Twitch.
    await waitFor(() => logs.includes("Rachat « Rire » de Alice : points gardés."), "la ligne du journal");
    connection.stop();
  });

  it("joue deux rachats l'un après l'autre : le second attend la fin du premier", async () => {
    const { reward, page, queue, connection } = await startSoundboard();
    const first = fake.sendRedemption({ rewardId: reward.id, user: "Alice" });
    const second = fake.sendRedemption({ rewardId: reward.id, user: "Bob" });
    await waitFor(() => page.events.length === 1, "le premier son");
    await sleep(50);
    expect(page.events).toHaveLength(1);
    queue.finish("play1", "ended");
    await waitFor(() => page.events.length === 2, "le second son");
    queue.finish("play2", "ended");
    await waitFor(() => getStatusOf(second) === "FULFILLED", "le second rachat");
    expect(getStatusOf(first)).toBe("FULFILLED");
    connection.stop();
  });

  it("rend les points (CANCELED) quand aucune page /sounds n'est connectée", async () => {
    const { reward, page, connection } = await startSoundboard();
    page.disconnect();
    const id = fake.sendRedemption({ rewardId: reward.id, user: "Alice" });
    await waitFor(() => getStatusOf(id) === "CANCELED", "les points rendus");
    expect(page.events).toEqual([]);
    connection.stop();
  });

  it("rend les points quand la page n'arrive pas à jouer le son (fichier illisible)", async () => {
    const { reward, page, queue, connection } = await startSoundboard();
    const id = fake.sendRedemption({ rewardId: reward.id, user: "Alice" });
    await waitFor(() => page.events.length === 1, "le son envoyé");
    queue.finish("play1", "failed", "fichier illisible");
    await waitFor(() => getStatusOf(id) === "CANCELED", "les points rendus");
    connection.stop();
  });

  it("rend les points du son en cours et de ceux qui attendent quand on coupe le son", async () => {
    const { reward, page, queue, connection } = await startSoundboard();
    const first = fake.sendRedemption({ rewardId: reward.id, user: "Alice" });
    const second = fake.sendRedemption({ rewardId: reward.id, user: "Bob" });
    await waitFor(() => page.events.length === 1, "le premier son");
    await sleep(50);
    queue.stop();
    await waitFor(
      () => getStatusOf(first) === "CANCELED" && getStatusOf(second) === "CANCELED",
      "les points rendus",
    );
    connection.stop();
  });

  it("rend les points quand le fichier du son a disparu du disque", async () => {
    const { reward, connection } = await startSoundboard();
    rmSync(join(directory, "data", "sounds", "sound001", "audio.wav"));
    const id = fake.sendRedemption({ rewardId: reward.id, user: "Alice" });
    await waitFor(() => getStatusOf(id) === "CANCELED", "les points rendus");
    connection.stop();
  });

  it("laisse intacte la redemption d'un reward qui n'a pas de son : ce n'est pas la sienne", async () => {
    const { page, connection } = await startSoundboard();
    const foreign = fake.addForeignReward("Pour le renard");
    const id = fake.sendRedemption({ rewardId: foreign, user: "Alice" });
    await waitFor(() => fake.redemptions().length === 1, "la redemption chez Twitch");
    await sleep(100);
    expect(getStatusOf(id)).toBe("UNFULFILLED");
    expect(page.events).toEqual([]);
    connection.stop();
  });

  it("ne touche jamais à la récompense qu'Alexis a faite pour le renard : le renard la reçoit, mais aucun statut, aucune pause, aucun remboursement", async () => {
    const { page, library, rewards, connection } = await startSoundboard();
    const foxReward = fake.addForeignReward("Clasher Fenysk");
    const before = fake.requests.length;
    const id = fake.sendRedemption({ rewardId: foxReward, user: "Alice", input: "un texte" });
    await waitFor(() => rewards.length === 1, "la récompense reçue par le renard");
    expect(rewards).toEqual([{ user: "Alice", title: "Clasher Fenysk" }]);
    // Le son de l'app part et revient, les récompenses des sons s'ouvrent et se mettent en pause : la sienne n'est jamais visée.
    await library.pauseRewards();
    await library.openRewards();
    await library.update("sound001", fieldsOf("Rire", { cost: 400 }));
    expect((await library.delete("sound001")).ok).toBe(true);
    const touched = fake.requests.slice(before).filter(({ query }) => query.includes(foxReward));
    expect(touched).toEqual([]);
    expect(getStatusOf(id)).toBe("UNFULFILLED");
    expect(fake.rewards().find((reward) => reward.id === foxReward)).toMatchObject({
      title: "Clasher Fenysk",
      isPaused: false,
    });
    expect(page.events).toEqual([]);
    connection.stop();
  });

  it("rend les points en attente d'un son qu'on supprime, au lieu de les laisser à Twitch qui les marquerait FULFILLED", async () => {
    const { reward, page, library, connection } = await startSoundboard();
    const first = fake.sendRedemption({ rewardId: reward.id, user: "Alice" });
    const second = fake.sendRedemption({ rewardId: reward.id, user: "Bob" });
    await waitFor(() => page.events.length === 1, "le premier son");
    await sleep(50);
    expect((await library.delete("sound001")).ok).toBe(true);
    expect(getStatusOf(first)).toBe("CANCELED");
    expect(getStatusOf(second)).toBe("CANCELED");
    expect(fake.rewards()).toEqual([]);
    connection.stop();
  });
});

describe("les points de chaîne contre le faux Twitch : le stream commence et finit", () => {
  it("au démarrage : sort les rewards de pause et rembourse les rachats restés UNFULFILLED", async () => {
    const first = await startSoundboard();
    await first.library.pauseRewards();
    expect(fake.rewards()[0]?.isPaused).toBe(true);
    first.connection.stop();
    await waitFor(() => fake.sockets() === 0, "la fermeture");
    // Un rachat arrivé pendant que le serveur ne lisait plus rien : il reste UNFULFILLED chez Twitch.
    const id = fake.sendRedemption({ rewardId: first.reward.id, user: "Alice" });
    expect(getStatusOf(id)).toBe("UNFULFILLED");

    const second = startStack();
    await second.connection.start();
    await waitFor(() => getStatusOf(id) === "CANCELED", "le rachat remboursé");
    expect(fake.rewards()[0]?.isPaused).toBe(false);
    second.connection.stop();
  });

  it("à l'arrêt : met les rewards en pause", async () => {
    const { library, connection } = await startSoundboard();
    expect(fake.rewards()[0]?.isPaused).toBe(false);
    await library.pauseRewards();
    expect(fake.rewards()[0]?.isPaused).toBe(true);
    connection.stop();
  });

  it("n'écrit jamais un jeton ni le secret dans le journal, rewards comprises", async () => {
    const { reward, page, queue, connection, logs } = await startSoundboard();
    const id = fake.sendRedemption({ rewardId: reward.id, user: "Alice" });
    await waitFor(() => page.events.length === 1, "le son envoyé");
    queue.finish("play1", "ended");
    await waitFor(() => getStatusOf(id) === "FULFILLED", "les points gardés");
    const text = logs.join("\n");
    for (const secret of ["fake-access", "fake-refresh", FAKE_CODE, FAKE_SECRET]) {
      expect(text).not.toContain(secret);
    }
    connection.stop();
  });
});

// Les appels qui changent un statut, une pause, un reward : tout ce que Twitch refuse (403) pour une récompense qu'Alexis a faite.
const getWrites = (before: number) =>
  fake.requests
    .slice(before)
    .filter(({ method, path }) => method !== "GET" && path.startsWith("/helix/channel_points"));

describe("les points de chaîne contre le faux Twitch : une récompense déjà faite sur Twitch reçoit un son", () => {
  // Connecté, une récompense faite à la main par Alexis, reliée à un son, et une page /sounds ouverte.
  const startLinked = async () => {
    const stack = startStack();
    await stack.connection.start();
    await stack.login();
    await waitFor(() => countOf(REWARD_TYPE) === 1, "l'abonnement aux récompenses");
    const clash = fake.addForeignReward("Clasher Fenysk", { cost: 500, cooldownSeconds: 60 });
    const created = await stack.library.create(draft("Pas ce titre", { rewardId: clash }));
    if (!created.ok) throw new Error("le son n'a pas été relié");
    return { ...stack, clash, sound: created.value, page: stack.connectPage() };
  };

  it("liste les récompenses de la chaîne sans son, avec leur titre, leur coût et leur cooldown, et demande lesquelles l'app gère", async () => {
    const stack = startStack();
    await stack.connection.start();
    await stack.login();
    fake.addForeignReward("Clasher Fenysk", { cost: 500, cooldownSeconds: 60 });
    fake.addForeignReward("Hydrate-toi");
    const before = fake.requests.length;
    const result = await stack.library.listRewards();
    expect(result).toEqual({
      ok: true,
      value: {
        choices: [
          { id: "reward-1", title: "Clasher Fenysk", cost: 500, pace: 60, isManageable: false },
          { id: "reward-2", title: "Hydrate-toi", cost: 50, pace: 0, isManageable: false },
        ],
        missing: [],
      },
    });
    const lists = fake.requests
      .slice(before)
      .filter(({ method, path }) => method === "GET" && path === "/helix/channel_points/custom_rewards");
    expect(lists.map(({ query }) => new URLSearchParams(query).get("only_manageable_rewards"))).toEqual([
      null,
      "true",
    ]);
    stack.connection.stop();
  });

  it("n'y met pas une récompense déjà reliée à un son, et signale le son dont la récompense a disparu de Twitch", async () => {
    const { library, clash, connection } = await startLinked();
    const other = fake.addForeignReward("Hydrate-toi");
    expect(await library.listRewards()).toMatchObject({
      ok: true,
      value: { choices: [{ id: other }], missing: [] },
    });
    fake.removeReward(clash);
    expect(await library.listRewards()).toMatchObject({ ok: true, value: { missing: ["sound001"] } });
    expect(library.list()).toMatchObject([{ id: "sound001", hasReward: true }]);
    connection.stop();
  });

  it("relie le son avec le titre, le coût et la cooldown de Twitch, en lecture seule : l'app ne la gère pas", async () => {
    const { library, sound, clash, connection } = await startLinked();
    expect(sound).toMatchObject({
      title: "Clasher Fenysk",
      cost: 500,
      pace: 60,
      isManaged: false,
      hasReward: true,
    });
    const before = fake.requests.length;
    const updated = await library.update(sound.id, draft("Autre titre", { cost: 1, pace: 0, fader: 20 }));
    expect(updated).toMatchObject({
      ok: true,
      value: { title: "Clasher Fenysk", cost: 500, pace: 60, fader: 20 },
    });
    expect(getWrites(before)).toEqual([]);
    expect(fake.rewards().find(({ id }) => id === clash)).toMatchObject({
      title: "Clasher Fenysk",
      cost: 500,
    });
    connection.stop();
  });

  it("joue le son au rachat, le renard reçoit le même évènement, et aucun statut n'est demandé à Twitch", async () => {
    const { clash, page, queue, rewards, connection, logs } = await startLinked();
    const before = fake.requests.length;
    const id = fake.sendRedemption({ rewardId: clash, user: "Alice" });
    await waitFor(() => page.events.length === 1, "le son envoyé à la page");
    await waitFor(() => rewards.length === 1, "l'évènement reçu par le renard");
    expect(rewards).toEqual([{ user: "Alice", title: "Clasher Fenysk" }]);
    queue.finish("play1", "ended");
    await sleep(100);
    expect(getWrites(before)).toEqual([]);
    expect(getStatusOf(id)).toBe("UNFULFILLED");
    expect(logs.some((line) => line.includes("points non marqués"))).toBe(false);
    connection.stop();
  });

  it("n'écrit que dans le journal un son qui n'a pas pu jouer : aucun statut, aucun remboursement", async () => {
    const { clash, page, queue, connection, logs } = await startLinked();
    const before = fake.requests.length;
    const first = fake.sendRedemption({ rewardId: clash, user: "Alice" });
    await waitFor(() => page.events.length === 1, "le son envoyé à la page");
    queue.finish("play1", "failed", "fichier illisible");
    page.disconnect();
    const second = fake.sendRedemption({ rewardId: clash, user: "Bob" });
    await waitFor(
      () => logs.filter((line) => line.includes("les points ne sont pas rendus")).length === 2,
      "les deux lignes du journal",
    );
    expect(getWrites(before)).toEqual([]);
    expect([getStatusOf(first), getStatusOf(second)]).toEqual(["UNFULFILLED", "UNFULFILLED"]);
    connection.stop();
  });

  it("ne la remet pas en route, ne la met pas en pause et ne rembourse rien au démarrage ni à l'arrêt", async () => {
    const { library, clash, connection } = await startLinked();
    const id = fake.sendRedemption({ rewardId: clash, user: "Alice" });
    await sleep(50);
    const before = fake.requests.length;
    await library.pauseRewards();
    await library.openRewards();
    expect(fake.requests.slice(before).filter(({ query }) => query.includes(clash))).toEqual([]);
    expect(fake.rewards().find((reward) => reward.id === clash)?.isPaused).toBe(false);
    expect(getStatusOf(id)).toBe("UNFULFILLED");
    connection.stop();
  });

  it("supprime le son sans supprimer la récompense sur Twitch : aucun DELETE", async () => {
    const { library, sound, clash, connection } = await startLinked();
    const before = fake.requests.length;
    expect((await library.delete(sound.id)).ok).toBe(true);
    expect(fake.requests.slice(before).some(({ method }) => method === "DELETE")).toBe(false);
    expect(getWrites(before)).toEqual([]);
    expect(fake.rewards().some(({ id }) => id === clash)).toBe(true);
    expect(library.list()).toEqual([]);
    connection.stop();
  });

  it("garde à côté la récompense que l'app a créée : elle est marquée, l'autre jamais", async () => {
    const { library, clash, page, queue, connection } = await startLinked();
    const created = await library.create(draft("Rire"));
    if (!created.ok) throw new Error("le son n'a pas été créé");
    const own = fake.rewards().find(({ title }) => title === "Rire");
    if (!own) throw new Error("le reward de l'app n'existe pas");
    const ownId = fake.sendRedemption({ rewardId: own.id, user: "Alice" });
    const foreignId = fake.sendRedemption({ rewardId: clash, user: "Bob" });
    await waitFor(() => page.events.length === 1, "le premier son");
    queue.finish("play1", "ended");
    await waitFor(() => page.events.length === 2, "le second son");
    queue.finish("play2", "ended");
    await waitFor(() => getStatusOf(ownId) === "FULFILLED", "le rachat de l'app marqué");
    expect(getStatusOf(foreignId)).toBe("UNFULFILLED");
    connection.stop();
  });
});

describe("les points de chaîne contre le faux Twitch : Jean-Renard dit une phrase", () => {
  const DRINK_PHRASE = "Bois un coup de la part de {user} !";

  // Connecté, avec une récompense faite à la main par Alexis (« À boire ! ») qui a des phrases.
  const startPhrases = async () => {
    const stack = startStack();
    await stack.connection.start();
    await stack.login();
    await waitFor(() => countOf(REWARD_TYPE) === 1, "l'abonnement aux récompenses");
    const drink = fake.addForeignReward("À boire !");
    const saved = await stack.phrases.update(drink, [DRINK_PHRASE]);
    if (!saved.ok) throw new Error("les phrases n'ont pas été gardées");
    return { ...stack, drink };
  };

  it("dit la phrase d'une récompense faite sur Twitch avec le nickname du viewer, en urgence, sans demander aucun statut", async () => {
    const { drink, spoken, connection } = await startPhrases();
    const before = fake.requests.length;
    const id = fake.sendRedemption({
      rewardId: drink,
      user: "Alice",
      input: "un texte qui ne doit pas être lu",
    });
    await waitFor(() => spoken.queued.length === 1, "la phrase poussée au renard");
    expect(spoken.queued[0]).toMatchObject({
      kind: "thanks",
      text: "Bois un coup de la part de Alice !",
      isUrgent: true,
      isCuttable: false,
    });
    expect(JSON.stringify(spoken.queued)).not.toContain("texte");
    await sleep(50);
    expect(getWrites(before)).toEqual([]);
    expect(getStatusOf(id)).toBe("UNFULFILLED");
    connection.stop();
  });

  it("garde les phrases au redémarrage du serveur, dans data/reward-phrases.json", async () => {
    const first = await startPhrases();
    first.connection.stop();
    await waitFor(() => fake.sockets() === 0, "la fermeture");
    expect(first.phrases.get(first.drink)).toEqual([DRINK_PHRASE]);
    const second = startStack();
    expect(second.phrases.get(first.drink)).toEqual([DRINK_PHRASE]);
    expect(JSON.parse(readFileSync(join(directory, "data", "reward-phrases.json"), "utf8"))).toEqual({
      [first.drink]: { title: "À boire !", phrases: [DRINK_PHRASE] },
    });
  });

  it("liste toutes les récompenses de la chaîne, avec ou sans son : celle qui a disparu de Twitch garde ses phrases", async () => {
    const { reward, phrases, connection } = await startSoundboard();
    const drink = fake.addForeignReward("À boire !");
    const stretch = fake.addForeignReward("Étirement !");
    const gone = fake.addForeignReward("Hydrate-toi");
    expect((await phrases.update(drink, [DRINK_PHRASE])).ok).toBe(true);
    expect((await phrases.update(gone, ["Un verre, {user} ?"])).ok).toBe(true);
    fake.removeReward(gone);
    expect(await phrases.list()).toEqual({
      ok: true,
      value: [
        { id: drink, title: "À boire !", isMissing: false, isReserved: false, phrases: [DRINK_PHRASE] },
        { id: stretch, title: "Étirement !", isMissing: false, isReserved: false, phrases: [] },
        { id: reward.id, title: "Rire", isMissing: false, isReserved: false, phrases: [] },
        {
          id: gone,
          title: "Hydrate-toi",
          isMissing: true,
          isReserved: false,
          phrases: ["Un verre, {user} ?"],
        },
      ],
    });
    connection.stop();
  });

  it("laisse la récompense du renard à son mécanisme : ses phrases sont refusées ici, et son rachat ne dit rien d'ici", async () => {
    const { phrases, spoken, rewards, connection } = await startSoundboard();
    const clash = fake.addForeignReward("Clasher Fenysk");
    expect(await phrases.update(clash, ["Salut {user}"])).toMatchObject({ ok: false, status: 422 });
    expect(await phrases.list()).toMatchObject({
      ok: true,
      value: expect.arrayContaining([expect.objectContaining({ id: clash, isReserved: true, phrases: [] })]),
    });
    const id = fake.sendRedemption({ rewardId: clash, user: "Alice" });
    await waitFor(() => rewards.length === 1, "la récompense reçue par le renard");
    await sleep(50);
    expect(spoken.queued).toEqual([]);
    expect(getStatusOf(id)).toBe("UNFULFILLED");
    connection.stop();
  });

  it("« Tester » dit une phrase tout de suite, avec Fenysk pour {user}", async () => {
    const { drink, foxReward, spoken, connection } = await startPhrases();
    expect(await foxReward.test(drink)).toMatchObject({ ok: true });
    expect(spoken.tested).toEqual(["Bois un coup de la part de Fenysk !"]);
    expect(spoken.queued).toEqual([]);
    connection.stop();
  });
});

describe("les points de chaîne contre le faux Twitch : le son, puis la phrase de Jean-Renard", () => {
  // Connecté, avec un son géré par l'app (« Rire ») qui a une phrase, et une page /sounds ouverte.
  const startSoundAndPhrase = async () => {
    const stack = await startSoundboard();
    const saved = await stack.phrases.update(stack.reward.id, ["Haha {user} !"]);
    if (!saved.ok) throw new Error("les phrases n'ont pas été gardées");
    return stack;
  };

  it("garde les points dès que le son a fini, puis dit la phrase : rien n'est dit pendant le son", async () => {
    const { reward, page, queue, spoken, connection } = await startSoundAndPhrase();
    const id = fake.sendRedemption({ rewardId: reward.id, user: "Alice" });
    await waitFor(() => page.events.length === 1, "le son envoyé à la page");
    await sleep(50);
    expect(spoken.queued).toEqual([]);
    queue.finish("play1", "ended");
    await waitFor(() => getStatusOf(id) === "FULFILLED", "les points gardés");
    await waitFor(() => spoken.queued.length === 1, "la phrase");
    expect(spoken.queued[0]?.text).toBe("Haha Alice !");
    connection.stop();
  });

  it("dit la phrase à la place d'un son raté : les points ne sont gardés qu'une fois la phrase dite", async () => {
    const { reward, page, queue, spoken, connection } = await startSoundAndPhrase();
    const id = fake.sendRedemption({ rewardId: reward.id, user: "Alice" });
    await waitFor(() => page.events.length === 1, "le son envoyé à la page");
    queue.finish("play1", "failed", "fichier illisible");
    await waitFor(() => spoken.queued.length === 1, "la phrase");
    await sleep(50);
    expect(getStatusOf(id)).toBe("UNFULFILLED");
    spoken.queued[0]?.onDone?.(true);
    await waitFor(() => getStatusOf(id) === "FULFILLED", "les points gardés");
    connection.stop();
  });

  it("rend les points seulement si le son a raté et que la phrase n'a pas pu être dite non plus", async () => {
    const { reward, page, queue, spoken, connection } = await startSoundAndPhrase();
    const id = fake.sendRedemption({ rewardId: reward.id, user: "Alice" });
    await waitFor(() => page.events.length === 1, "le son envoyé à la page");
    queue.finish("play1", "failed", "fichier illisible");
    await waitFor(() => spoken.queued.length === 1, "la phrase");
    spoken.queued[0]?.onDone?.(false);
    await waitFor(() => getStatusOf(id) === "CANCELED", "les points rendus");
    connection.stop();
  });

  it("garde les points quand aucune page /sounds n'est connectée mais que la phrase est dite", async () => {
    const { reward, page, spoken, connection } = await startSoundAndPhrase();
    page.disconnect();
    const id = fake.sendRedemption({ rewardId: reward.id, user: "Alice" });
    await waitFor(() => spoken.queued.length === 1, "la phrase");
    spoken.queued[0]?.onDone?.(true);
    await waitFor(() => getStatusOf(id) === "FULFILLED", "les points gardés");
    connection.stop();
  });

  it("rend les points et ne dit rien quand on coupe le son : couper demande le silence", async () => {
    const { reward, page, queue, spoken, connection } = await startSoundAndPhrase();
    const first = fake.sendRedemption({ rewardId: reward.id, user: "Alice" });
    const second = fake.sendRedemption({ rewardId: reward.id, user: "Bob" });
    await waitFor(() => page.events.length === 1, "le premier son");
    await sleep(50);
    queue.stop();
    await waitFor(
      () => getStatusOf(first) === "CANCELED" && getStatusOf(second) === "CANCELED",
      "les points rendus",
    );
    expect(spoken.queued).toEqual([]);
    connection.stop();
  });

  it("joue un son sans phrases comme avant, sans créer de fichier de phrases", async () => {
    const { reward, page, queue, spoken, connection } = await startSoundboard();
    const id = fake.sendRedemption({ rewardId: reward.id, user: "Alice" });
    await waitFor(() => page.events.length === 1, "le son envoyé à la page");
    queue.finish("play1", "ended");
    await waitFor(() => getStatusOf(id) === "FULFILLED", "les points gardés");
    expect(spoken.queued).toEqual([]);
    expect(existsSync(join(directory, "data", "reward-phrases.json"))).toBe(false);
    connection.stop();
  });

  it("n'envoie aucun statut pour la récompense d'Alexis reliée à un son, la phrase dite ou non", async () => {
    const stack = startStack();
    await stack.connection.start();
    await stack.login();
    await waitFor(() => countOf(REWARD_TYPE) === 1, "l'abonnement aux récompenses");
    const drink = fake.addForeignReward("À boire !");
    expect((await stack.library.create(draft("Pas ce titre", { rewardId: drink }))).ok).toBe(true);
    expect((await stack.phrases.update(drink, ["Santé {user} !"])).ok).toBe(true);
    const page = stack.connectPage();
    const before = fake.requests.length;
    const first = fake.sendRedemption({ rewardId: drink, user: "Alice" });
    await waitFor(() => page.events.length === 1, "le premier son");
    stack.queue.finish("play1", "ended");
    await waitFor(() => stack.spoken.queued.length === 1, "la phrase après le son fini");
    const second = fake.sendRedemption({ rewardId: drink, user: "Bob" });
    await waitFor(() => page.events.length === 2, "le second son");
    stack.queue.finish("play2", "failed", "fichier illisible");
    await waitFor(() => stack.spoken.queued.length === 2, "la phrase après le son raté");
    stack.spoken.queued[1]?.onDone?.(false);
    await sleep(100);
    expect(stack.spoken.queued.map(({ text }) => text)).toEqual(["Santé Alice !", "Santé Bob !"]);
    expect(getWrites(before)).toEqual([]);
    expect([getStatusOf(first), getStatusOf(second)]).toEqual(["UNFULFILLED", "UNFULFILLED"]);
    stack.connection.stop();
  });
});
