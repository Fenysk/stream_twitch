import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { Duplex } from "node:stream";
import {
  createFakeRewards,
  type FakeReward,
  type FakeSpend,
  REWARDS_PATH,
} from "./fake-twitch-rewards.testkit";

// Un faux Twitch pour les tests : un serveur HTTP (jeton, renouvellement, compte, révocation, abonnements EventSub, rewards de
// points de chaîne et leurs redemptions) et un WebSocket EventSub minimal, sur 127.0.0.1. Il joue le rôle de id.twitch.tv,
// api.twitch.tv et eventsub.wss.twitch.tv.
export const FAKE_CODE = "FAKE-CODE";
export const FAKE_SECRET = "le-secret-de-l-app";
export const FAKE_CLIENT_ID = "mon-client";
export const FAKE_REDIRECT = "http://localhost:4747/auth/twitch/callback";

export type { FakeReward, FakeSpend };

// `query` : la partie de l'adresse après « ? » (`id=reward-1&broadcaster_id=68710381`).
export type FakeRequest = {
  method: string;
  path: string;
  query: string;
  headers: Record<string, string>;
  body: string;
};

export type FakeTwitch = {
  httpUrl: string;
  socketUrl: string;
  requests: FakeRequest[];
  // Les demandes qui ont ce chemin.
  requestsTo(path: string): FakeRequest[];
  // Les jetons d'accès et de renouvellement donnés depuis le début, du premier au dernier.
  accessTokens: string[];
  refreshTokens: string[];
  sockets(): number;
  // Le nombre d'abonnements EventSub acceptés, et leurs types dans l'ordre où ils sont arrivés.
  subscriptions(): number;
  subscribedTypes(): string[];
  // Envoie un follow, ou une récompense de points de chaîne (avec le texte que le viewer y joint), à toutes les connexions EventSub.
  sendFollow(user: string): void;
  sendReward(user: string, title: string, userInput?: string): void;
  // Les rewards que Twitch connaît (ceux de l'application et ceux qu'Alexis a faits à la main), et leurs redemptions.
  rewards(): FakeReward[];
  redemptions(): FakeSpend[];
  // Un viewer dépense ses points sur ce reward : la spend est UNFULFILLED chez Twitch et part en notification EventSub, avec
  // ses vrais identifiants. Rend l'identifiant de la spend.
  sendRedemption(spend: { rewardId: string; user: string; input?: string }): string;
  // Un reward qu'Alexis a fait à la main : l'application ne le gère pas (pas de statut, pas de pause), et son titre est pris.
  addForeignReward(title: string, options?: { cost?: number; cooldownSeconds?: number }): string;
  // Twitch retire un reward sans que l'application le sache.
  removeReward(id: string): void;
  // La chaîne n'est plus (ou redevient) affiliée : les appels des points de chaîne répondent 403.
  setAffiliate(isAffiliate: boolean): void;
  // Le nombre de rewards au-delà duquel Twitch refuse d'en créer (50 chez Twitch).
  setMaxRewards(count: number): void;
  // Une prédiction qui se termine : ses issues (titre, viewers), laquelle gagne (son rang, `null` : annulée).
  sendPredictionEnd(outcomes: readonly { title: string; users: number }[], winner: number | null): void;
  // Les droits que Twitch donne aux prochains jetons et dit à /validate (un jeton d'avant les récompenses n'a que les follows).
  setScopes(scopes: readonly string[]): void;
  // Twitch refuse les abonnements de ce type (403).
  refuseType(type: string): void;
  // Coupe toutes les connexions EventSub (une panne).
  breakSockets(): void;
  // Twitch ne reconnaît plus aucun jeton donné jusque-là (l'utilisateur a retiré l'accès).
  revokeEverything(): void;
  // La durée des prochains jetons d'accès, en secondes.
  setLifetime(seconds: number): void;
  stop(): Promise<void>;
};

type Reply = { status: number; body: string };

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const INVALID_CODE = '{ "status": 400, "message": "Invalid authorization code" }';
const INVALID_REFRESH = '{ "status": 400, "message": "Invalid refresh token" }';
const INVALID_SECRET = '{ "status": 403, "message": "invalid client secret" }';
const INVALID_ACCESS = '{ "status": 401, "message": "invalid access token" }';
const DEFAULT_SCOPES = ["moderator:read:followers", "channel:manage:redemptions", "channel:read:predictions"];
const FOLLOW_TYPE = "channel.follow";
const REWARD_TYPE = "channel.channel_points_custom_reward_redemption.add";
const PREDICTION_TYPE = "channel.prediction.end";

// Une trame texte du serveur vers le client (non masquée, moins de 64 Ko).
const toPacket = (text: string): Buffer => {
  const payload = Buffer.from(text);
  const header =
    payload.length < 126
      ? Buffer.from([0x81, payload.length])
      : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 0xff]);
  return Buffer.concat([header, payload]);
};

const getBody = (request: IncomingMessage): Promise<string> =>
  new Promise((resolve) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });

const toHeaders = (request: IncomingMessage): Record<string, string> => {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === "string") headers[name] = value;
  }
  return headers;
};

export async function startFakeTwitch(): Promise<FakeTwitch> {
  const requests: FakeRequest[] = [];
  const accessTokens: string[] = [];
  const refreshTokens: string[] = [];
  const revoked = new Set<string>();
  const sockets = new Set<Duplex>();
  const subscribed: string[] = [];
  const fakeRewards = createFakeRewards();
  let spendNotifications = 0;
  const refusedTypes = new Set<string>();
  let scopes: readonly string[] = DEFAULT_SCOPES;
  let lifetime = 14_400;
  let sessionCount = 0;
  let followCount = 0;
  let rewardCount = 0;
  let predictionCount = 0;

  // Un jeton valable est le dernier donné et pas retiré.
  const isCurrent = (token: string | undefined, list: string[]): boolean =>
    token !== undefined && token === list.at(-1) && !revoked.has(token);

  // Des jetons neufs : à chaque fois d'autres, comme Twitch (le jeton de renouvellement change à chaque fois).
  const issue = (): Reply => {
    const index = accessTokens.length + 1;
    accessTokens.push(`fake-access-${index}`);
    refreshTokens.push(`fake-refresh-${index}`);
    return {
      status: 200,
      body: `{ "access_token": "fake-access-${index}", "refresh_token": "fake-refresh-${index}", "expires_in": ${lifetime}, "scope": ${JSON.stringify(scopes)}, "token_type": "bearer" }`,
    };
  };

  const answerCode = (form: URLSearchParams): Reply => {
    const isValid = form.get("code") === FAKE_CODE && form.get("redirect_uri") === FAKE_REDIRECT;
    return isValid ? issue() : { status: 400, body: INVALID_CODE };
  };

  const answerRefresh = (form: URLSearchParams): Reply =>
    isCurrent(form.get("refresh_token") ?? undefined, refreshTokens)
      ? issue()
      : { status: 400, body: INVALID_REFRESH };

  const answerToken = (body: string): Reply => {
    const form = new URLSearchParams(body);
    if (form.get("client_secret") !== FAKE_SECRET || form.get("client_id") !== FAKE_CLIENT_ID) {
      return { status: 403, body: INVALID_SECRET };
    }
    const grant = form.get("grant_type");
    if (grant === "authorization_code") return answerCode(form);
    return grant === "refresh_token" ? answerRefresh(form) : { status: 400, body: INVALID_REFRESH };
  };

  // Un appel de l'API Helix : le dernier jeton donné et pas retiré, avec le client-id de l'application.
  const isAuthorized = (headers: Record<string, string>): boolean =>
    isCurrent(headers.authorization?.replace(/^Bearer /, ""), accessTokens) &&
    headers["client-id"] === FAKE_CLIENT_ID;

  const unauthorized = (): Reply => ({
    status: 401,
    body: '{ "status": 401, "message": "Invalid OAuth token" }',
  });

  const answerRewards = (request: FakeRequest): Reply | undefined => {
    if (!request.path.startsWith(REWARDS_PATH)) return undefined;
    if (!isAuthorized(request.headers)) return unauthorized();
    return fakeRewards.answer({
      method: request.method,
      path: request.path,
      query: new URLSearchParams(request.query),
      body: request.body,
    });
  };

  const answerSubscription = ({ headers, body }: FakeRequest): Reply => {
    if (!isAuthorized(headers)) return unauthorized();
    const type: unknown = JSON.parse(body || "{}").type;
    if (typeof type !== "string" || refusedTypes.has(type)) {
      return {
        status: 403,
        body: '{ "status": 403, "message": "subscription missing proper authorization" }',
      };
    }
    subscribed.push(type);
    return { status: 202, body: '{ "data": [], "total": 1 }' };
  };

  const answerIdentity = (headers: Record<string, string>): Reply => {
    const isValid = isCurrent(headers.authorization?.replace(/^OAuth /, ""), accessTokens);
    const identity = `{ "client_id": "mon-client", "login": "fenysk", "scopes": ${JSON.stringify(scopes)}, "user_id": "68710381", "expires_in": 14000 }`;
    return isValid ? { status: 200, body: identity } : { status: 401, body: INVALID_ACCESS };
  };

  const answerRevoke = (body: string): Reply => {
    revoked.add(new URLSearchParams(body).get("token") ?? "");
    return { status: 200, body: "" };
  };

  const answer = (request: FakeRequest): Reply => {
    const route = `${request.method} ${request.path}`;
    if (route === "POST /oauth2/token") return answerToken(request.body);
    if (route === "GET /oauth2/validate") return answerIdentity(request.headers);
    if (route === "POST /oauth2/revoke") return answerRevoke(request.body);
    if (route === "POST /helix/eventsub/subscriptions") return answerSubscription(request);
    return answerRewards(request) ?? { status: 404, body: '{ "message": "inconnu" }' };
  };

  const server: Server = createServer(async (incoming, response) => {
    const url = new URL(incoming.url ?? "/", "http://fake");
    const request: FakeRequest = {
      method: incoming.method ?? "GET",
      path: url.pathname,
      query: url.search.replace(/^\?/, ""),
      headers: toHeaders(incoming),
      body: await getBody(incoming),
    };
    requests.push(request);
    const reply = answer(request);
    response.writeHead(reply.status, { "content-type": "application/json" });
    response.end(reply.body);
  });

  server.on("upgrade", (incoming: IncomingMessage, socket: Duplex) => {
    requests.push({
      method: "GET",
      path: new URL(incoming.url ?? "/", "http://fake").pathname,
      query: "",
      headers: toHeaders(incoming),
      body: "",
    });
    const key = incoming.headers["sec-websocket-key"];
    if (typeof key !== "string") {
      socket.destroy();
      return;
    }
    const accept = createHash("sha1").update(`${key}${GUID}`).digest("base64");
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    sockets.add(socket);
    sessionCount += 1;
    socket.write(
      toPacket(
        `{"metadata":{"message_id":"welcome-${sessionCount}","message_type":"session_welcome","message_timestamp":"${new Date().toISOString()}"},"payload":{"session":{"id":"fake-session-${sessionCount}","status":"connected","keepalive_timeout_seconds":10,"reconnect_url":null}}}`,
      ),
    );
    socket.on("data", (data: Buffer) => {
      // Le client ferme : on répond et on coupe.
      if (((data[0] ?? 0) & 0x0f) === 8) {
        socket.write(Buffer.from([0x88, 0]));
        socket.end();
      }
    });
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => sockets.delete(socket));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("le faux Twitch n'a pas de port");

  return {
    httpUrl: `http://127.0.0.1:${address.port}`,
    socketUrl: `ws://127.0.0.1:${address.port}/ws`,
    requests,
    requestsTo: (path) => requests.filter((request) => request.path === path),
    accessTokens,
    refreshTokens,
    sockets: () => sockets.size,
    subscriptions: () => subscribed.length,
    subscribedTypes: () => [...subscribed],
    sendFollow(user) {
      followCount += 1;
      const message = `{"metadata":{"message_id":"follow-${followCount}","message_type":"notification","message_timestamp":"${new Date().toISOString()}","subscription_type":"${FOLLOW_TYPE}"},"payload":{"event":{"user_id":"${followCount}","user_login":"${user.toLowerCase()}","user_name":"${user}","broadcaster_user_id":"68710381"}}}`;
      for (const socket of sockets) socket.write(toPacket(message));
    },
    sendReward(user, title, userInput = "") {
      rewardCount += 1;
      const message = `{"metadata":{"message_id":"reward-${rewardCount}","message_type":"notification","message_timestamp":"${new Date().toISOString()}","subscription_type":"${REWARD_TYPE}"},"payload":{"event":{"id":"spend-${rewardCount}","user_id":"${rewardCount}","user_login":"${user.toLowerCase()}","user_name":"${user}","broadcaster_user_id":"68710381","user_input":"${userInput}","status":"unfulfilled","reward":{"id":"reward-id","title":"${title}","cost":100,"prompt":""}}}}`;
      for (const socket of sockets) socket.write(toPacket(message));
    },
    rewards: () => [...fakeRewards.rewards.values()],
    redemptions: () => [...fakeRewards.redemptions.values()],
    sendRedemption({ rewardId, user, input = "" }) {
      const spend = fakeRewards.createRedemption(rewardId, user, input);
      spendNotifications += 1;
      const title = JSON.stringify(fakeRewards.rewards.get(rewardId)?.title ?? "");
      const event = `{"id":"${spend.id}","broadcaster_user_id":"68710381","user_id":"2","user_login":"${user.toLowerCase()}","user_name":"${user}","user_input":${JSON.stringify(input)},"status":"unfulfilled","reward":{"id":"${rewardId}","title":${title},"cost":100,"prompt":""},"redeemed_at":"${new Date().toISOString()}"}`;
      const message = `{"metadata":{"message_id":"spend-message-${spendNotifications}","message_type":"notification","message_timestamp":"${new Date().toISOString()}","subscription_type":"${REWARD_TYPE}"},"payload":{"event":${event}}}`;
      for (const socket of sockets) socket.write(toPacket(message));
      return spend.id;
    },
    addForeignReward: (title, options) => fakeRewards.addForeignReward(title, options),
    removeReward: (id) => fakeRewards.removeReward(id),
    setAffiliate: (isAffiliate) => fakeRewards.setAffiliate(isAffiliate),
    setMaxRewards: (count) => fakeRewards.setMaxRewards(count),
    sendPredictionEnd(outcomes, winner) {
      predictionCount += 1;
      const lines = outcomes.map(
        ({ title, users }, index) =>
          `{"id":"outcome-${index}","title":"${title}","color":"blue","users":${users},"channel_points":${users * 100},"top_predictors":[]}`,
      );
      const winning = winner === null ? "null" : `"outcome-${winner}"`;
      const status = winner === null ? "canceled" : "resolved";
      const message = `{"metadata":{"message_id":"prediction-${predictionCount}","message_type":"notification","message_timestamp":"${new Date().toISOString()}","subscription_type":"${PREDICTION_TYPE}"},"payload":{"event":{"id":"prediction-id","broadcaster_user_id":"68710381","title":"Un titre","winning_outcome_id":${winning},"outcomes":[${lines.join(",")}],"status":"${status}"}}}`;
      for (const socket of sockets) socket.write(toPacket(message));
    },
    setScopes(next) {
      scopes = next;
    },
    refuseType(type) {
      refusedTypes.add(type);
    },
    breakSockets() {
      for (const socket of sockets) socket.destroy();
      sockets.clear();
    },
    revokeEverything() {
      for (const token of [...accessTokens, ...refreshTokens]) revoked.add(token);
    },
    setLifetime(seconds) {
      lifetime = seconds;
    },
    stop: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
