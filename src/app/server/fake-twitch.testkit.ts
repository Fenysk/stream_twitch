import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { Duplex } from "node:stream";

// Un faux Twitch pour les tests : un serveur HTTP (jeton, renouvellement, compte, révocation, abonnement EventSub) et un
// WebSocket EventSub minimal, sur 127.0.0.1. Il joue le rôle de id.twitch.tv, api.twitch.tv et eventsub.wss.twitch.tv.
export const FAKE_CODE = "FAKE-CODE";
export const FAKE_SECRET = "le-secret-de-l-app";
export const FAKE_CLIENT_ID = "mon-client";
export const FAKE_REDIRECT = "http://localhost:4747/auth/twitch/callback";

export type FakeRequest = { method: string; path: string; headers: Record<string, string>; body: string };

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
  // Le nombre d'abonnements EventSub acceptés.
  subscriptions(): number;
  // Envoie un follow à toutes les connexions EventSub.
  sendFollow(user: string): void;
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
const IDENTITY =
  '{ "client_id": "mon-client", "login": "fenysk", "scopes": ["moderator:read:followers"], "user_id": "68710381", "expires_in": 14000 }';

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
  let subscriptions = 0;
  let lifetime = 14_400;
  let sessionCount = 0;
  let followCount = 0;

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
      body: `{ "access_token": "fake-access-${index}", "refresh_token": "fake-refresh-${index}", "expires_in": ${lifetime}, "scope": ["moderator:read:followers"], "token_type": "bearer" }`,
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

  const answerSubscription = (headers: Record<string, string>): Reply => {
    const token = headers.authorization?.replace(/^Bearer /, "");
    if (!isCurrent(token, accessTokens) || headers["client-id"] !== FAKE_CLIENT_ID) {
      return { status: 401, body: '{ "status": 401, "message": "Invalid OAuth token" }' };
    }
    subscriptions += 1;
    return { status: 202, body: '{ "data": [], "total": 1 }' };
  };

  const answer = (request: FakeRequest): Reply => {
    const route = `${request.method} ${request.path}`;
    if (route === "POST /oauth2/token") return answerToken(request.body);
    if (route === "GET /oauth2/validate") {
      const isValid = isCurrent(request.headers.authorization?.replace(/^OAuth /, ""), accessTokens);
      return isValid ? { status: 200, body: IDENTITY } : { status: 401, body: INVALID_ACCESS };
    }
    if (route === "POST /oauth2/revoke") {
      revoked.add(new URLSearchParams(request.body).get("token") ?? "");
      return { status: 200, body: "" };
    }
    if (route === "POST /helix/eventsub/subscriptions") return answerSubscription(request.headers);
    return { status: 404, body: '{ "message": "inconnu" }' };
  };

  const server: Server = createServer(async (incoming, response) => {
    const request: FakeRequest = {
      method: incoming.method ?? "GET",
      path: new URL(incoming.url ?? "/", "http://fake").pathname,
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
    subscriptions: () => subscriptions,
    sendFollow(user) {
      followCount += 1;
      const message = `{"metadata":{"message_id":"follow-${followCount}","message_type":"notification","message_timestamp":"${new Date().toISOString()}","subscription_type":"channel.follow"},"payload":{"event":{"user_id":"${followCount}","user_login":"${user.toLowerCase()}","user_name":"${user}","broadcaster_user_id":"68710381"}}}`;
      for (const socket of sockets) socket.write(toPacket(message));
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
