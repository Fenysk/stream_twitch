import { describe, expect, it } from "vitest";
import type { LiveEvent } from "../domain/live.types";
import type { TwitchTopic } from "../domain/twitch.schema";
import type { EventFeedTarget } from "../usecase/twitch-connection.usecase";
import { createEventFeed, type FeedSocket } from "./twitch-events.client";

const NOW = Date.parse("2026-10-13T12:00:00.000Z");
const iso = (at: number): string => new Date(at).toISOString();

// Les messages d'EventSub, écrits comme Twitch les envoie (en snake_case, depuis du JSON).
const welcome = (sessionId: string, keepalive = 10): string =>
  `{"metadata":{"message_id":"welcome-${sessionId}","message_type":"session_welcome","message_timestamp":"${iso(NOW)}"},"payload":{"session":{"id":"${sessionId}","status":"connected","keepalive_timeout_seconds":${keepalive},"reconnect_url":null}}}`;
const keepaliveMessage = `{"metadata":{"message_id":"ka","message_type":"session_keepalive","message_timestamp":"${iso(NOW)}"},"payload":{}}`;
const reconnectMessage = (url: string): string =>
  `{"metadata":{"message_id":"rc","message_type":"session_reconnect","message_timestamp":"${iso(NOW)}"},"payload":{"session":{"id":"old","status":"reconnecting","reconnect_url":"${url}"}}}`;
const revocationMessage = `{"metadata":{"message_id":"rv","message_type":"revocation","message_timestamp":"${iso(NOW)}","subscription_type":"channel.follow"},"payload":{"subscription":{"id":"s1","status":"authorization_revoked","type":"channel.follow"}}}`;
const follow = (id: string, user: string, at = NOW, type = "channel.follow"): string =>
  `{"metadata":{"message_id":"${id}","message_type":"notification","message_timestamp":"${iso(at)}","subscription_type":"${type}"},"payload":{"event":{"user_id":"1","user_login":"${user.toLowerCase()}","user_name":"${user}","broadcaster_user_id":"68710381"}}}`;
// Une prédiction qui se termine : `winning` (`null` : annulée), les issues (identifiant, titre, viewers) et le statut.
type OutcomeLine = readonly [id: string, title: string, users: number];
const prediction = (
  id: string,
  {
    status = "resolved",
    winning = "o1",
    outcomes = [
      ["o1", "Oui", 3],
      ["o2", "Non", 7],
    ],
  }: { status?: string; winning?: string | null; outcomes?: readonly OutcomeLine[] } = {},
): string => {
  const lines = outcomes.map(
    ([outcomeId, title, users]) =>
      `{"id":"${outcomeId}","title":"${title}","color":"blue","users":${users},"channel_points":${users * 100},"top_predictors":[]}`,
  );
  return `{"metadata":{"message_id":"${id}","message_type":"notification","message_timestamp":"${iso(NOW)}","subscription_type":"channel.prediction.end"},"payload":{"event":{"id":"p1","broadcaster_user_id":"68710381","title":"Un titre","winning_outcome_id":${winning === null ? "null" : `"${winning}"`},"outcomes":[${lines.join(",")}],"status":"${status}"}}}`;
};

// `omitted` : les morceaux que Twitch n'aurait pas donnés (le nom affiché, le login, la récompense).
type RewardPart = "name" | "login" | "reward";
const reward = (
  id: string,
  user: string,
  title: string,
  userInput = "",
  at = NOW,
  omitted: readonly RewardPart[] = [],
): string => {
  const keep = (part: RewardPart, text: string): string => (omitted.includes(part) ? "" : text);
  const login = keep("login", `"user_login":"${user.toLowerCase()}",`);
  const name = keep("name", `"user_name":"${user}",`);
  const details = keep("reward", `,"reward":{"id":"w1","title":"${title}","cost":100,"prompt":""}`);
  return `{"metadata":{"message_id":"${id}","message_type":"notification","message_timestamp":"${iso(at)}","subscription_type":"channel.channel_points_custom_reward_redemption.add"},"payload":{"event":{"id":"r1","user_id":"1",${login}${name}"broadcaster_user_id":"68710381","user_input":"${userInput}","status":"unfulfilled"${details}}}}`;
};
const followLoginOnly = `{"metadata":{"message_id":"n-login","message_type":"notification","message_timestamp":"${iso(NOW)}","subscription_type":"channel.follow"},"payload":{"event":{"user_login":"bob"}}}`;

type FakeSocket = FeedSocket & {
  url: string;
  isClosed: boolean;
  emit(text: string): void;
  drop(): void;
};

// `respond` reçoit le corps de la demande d'abonnement (son type, sa condition…) ; `topics` : les abonnements demandés.
const setup = (
  respond: (body: Record<string, unknown>) => Response | Promise<Response> = () =>
    new Response(null, { status: 202 }),
  tokenFor: (isForced: boolean) => string | null = () => "ACCESS-X",
  topics: readonly TwitchTopic[] = ["follow"],
) => {
  const state = { now: NOW };
  const sockets: FakeSocket[] = [];
  const timers: { at: number; callback: () => void; isCancelled: boolean }[] = [];
  const logs: string[] = [];
  const events: LiveEvent[] = [];
  // Les pseudos des follows reçus.
  const follows: string[] = [];
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const wasForced: boolean[] = [];
  const feed = createEventFeed({
    clientId: "mon-client",
    schedule(callback, ms) {
      const timer = { at: state.now + ms, callback, isCancelled: false };
      timers.push(timer);
      return () => {
        timer.isCancelled = true;
      };
    },
    log: (line) => logs.push(line),
    clock: () => state.now,
    fetcher: (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return respond(JSON.parse(String(init?.body ?? "{}")));
    }) as typeof fetch,
    createSocket(url) {
      let listener: Parameters<FeedSocket["listen"]>[0] | undefined;
      const socket: FakeSocket = {
        url,
        isClosed: false,
        listen(next) {
          listener = next;
        },
        close() {
          socket.isClosed = true;
        },
        emit: (text) => listener?.onMessage(text),
        drop: () => listener?.onClose(),
      };
      sockets.push(socket);
      return socket;
    },
  });
  const target: EventFeedTarget = {
    broadcasterId: "68710381",
    moderatorId: "68710381",
    topics,
    getAccessToken: async (isForced) => {
      wasForced.push(isForced);
      return tokenFor(isForced);
    },
    onEvent: (event) => {
      events.push(event);
      if (event.kind === "follow") follows.push(event.user);
    },
  };
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
  const last = (): FakeSocket => {
    const socket = sockets.at(-1);
    if (!socket) throw new Error("aucune connexion");
    return socket;
  };
  return {
    feed,
    target,
    state,
    sockets,
    logs,
    events,
    follows,
    requests,
    wasForced,
    flush,
    advance,
    last,
    pending: () => timers.filter(({ isCancelled }) => !isCancelled).length,
    // Ouvre le flux et reçoit le bonjour de Twitch : le flux est abonné.
    subscribed: async () => {
      feed.open(target);
      last().emit(welcome("session-1"));
      await flush();
    },
  };
};

describe("l'ouverture du flux", () => {
  it("se connecte à l'adresse d'EventSub", () => {
    const { feed, target, sockets } = setup();
    feed.open(target);
    expect(sockets.map(({ url }) => url)).toEqual(["wss://eventsub.wss.twitch.tv/ws"]);
  });

  it("s'abonne à channel.follow version 2 dès le bonjour de Twitch, pour la chaîne et ce modérateur", async () => {
    const { requests, subscribed } = setup();
    await subscribed();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://api.twitch.tv/helix/eventsub/subscriptions");
    expect(requests[0]?.init?.method).toBe("POST");
    const headers = new Headers(requests[0]?.init?.headers);
    expect(headers.get("authorization")).toBe("Bearer ACCESS-X");
    expect(headers.get("client-id")).toBe("mon-client");
    expect(headers.get("content-type")).toBe("application/json");
    const body: Record<string, unknown> = JSON.parse(String(requests[0]?.init?.body));
    expect(body.type).toBe("channel.follow");
    expect(body.version).toBe("2");
    expect(body.condition).toEqual(
      JSON.parse('{"broadcaster_user_id":"68710381","moderator_user_id":"68710381"}'),
    );
    expect(body.transport).toEqual(JSON.parse('{"method":"websocket","session_id":"session-1"}'));
  });

  it("le dit une fois abonné, sans jamais écrire le jeton", async () => {
    const { logs, subscribed } = setup();
    await subscribed();
    expect(logs).toEqual(["Twitch : abonné aux follows (EventSub)."]);
  });

  it("demande le jeton non forcé la première fois", async () => {
    const { wasForced, subscribed } = setup();
    await subscribed();
    expect(wasForced).toEqual([false]);
  });
});

describe("les follows reçus", () => {
  it("donne le nom affiché de chaque follow", async () => {
    const { last, flush, follows, subscribed } = setup();
    await subscribed();
    last().emit(follow("n1", "Alice"));
    last().emit(follow("n2", "Bob"));
    await flush();
    expect(follows).toEqual(["Alice", "Bob"]);
  });

  it("prend le login quand le nom affiché manque", async () => {
    const { last, follows, subscribed } = setup();
    await subscribed();
    last().emit(followLoginOnly);
    expect(follows).toEqual(["bob"]);
  });

  it("ne donne qu'une fois un message que Twitch répète", async () => {
    const { last, follows, subscribed } = setup();
    await subscribed();
    last().emit(follow("n1", "Alice"));
    last().emit(follow("n1", "Alice"));
    expect(follows).toEqual(["Alice"]);
  });

  it("ignore une notification d'une autre sorte", async () => {
    const { last, follows, subscribed } = setup();
    await subscribed();
    last().emit(follow("n1", "Alice", NOW, "channel.subscribe"));
    expect(follows).toEqual([]);
  });

  it("ignore une rediffusion de plus de 10 min, garde celle de 9 min", async () => {
    const { last, follows, subscribed } = setup();
    await subscribed();
    last().emit(follow("old", "Vieux", NOW - 10 * 60_000 - 1));
    last().emit(follow("recent", "Recent", NOW - 9 * 60_000));
    expect(follows).toEqual(["Recent"]);
  });

  it("ignore un message qui n'est pas du JSON, ou sans rien d'utile", async () => {
    const { last, follows, subscribed, logs } = setup();
    await subscribed();
    last().emit("pas du json");
    last().emit("{}");
    last().emit('{"metadata":{"message_type":"notification"},"payload":{}}');
    expect(follows).toEqual([]);
    expect(logs).toHaveLength(1);
  });

  it("dit quand Twitch retire l'abonnement, avec sa raison", async () => {
    const { last, logs, subscribed } = setup();
    await subscribed();
    last().emit(revocationMessage);
    expect(logs).toContain(
      "Twitch : l'abonnement aux follows a été retiré par Twitch (authorization_revoked).",
    );
  });
});

describe("quand l'abonnement est refusé", () => {
  it("redemande un jeton forcé après un 401, puis s'abonne avec lui", async () => {
    let calls = 0;
    const { requests, wasForced, logs, feed, target, last, flush } = setup(
      () => {
        calls += 1;
        return new Response(null, { status: calls === 1 ? 401 : 202 });
      },
      (isForced) => (isForced ? "ACCESS-FRESH" : "ACCESS-OLD"),
    );
    feed.open(target);
    last().emit(welcome("session-1"));
    await flush();
    expect(wasForced).toEqual([false, true]);
    expect(new Headers(requests[1]?.init?.headers).get("authorization")).toBe("Bearer ACCESS-FRESH");
    expect(logs).toEqual(["Twitch : abonné aux follows (EventSub)."]);
  });

  it("ferme et réessaie plus tard après un autre refus (403), sans écrire le jeton", async () => {
    const { logs, sockets, last, pending, advance, subscribed } = setup(
      () => new Response(null, { status: 403 }),
    );
    await subscribed();
    expect(logs).toContain("Twitch : abonnement aux follows refusé (HTTP 403).");
    expect(sockets[0]?.isClosed).toBe(true);
    expect(pending()).toBe(1);
    await advance(4999);
    expect(sockets).toHaveLength(1);
    await advance(1);
    expect(sockets).toHaveLength(2);
    expect(last().url).toBe("wss://eventsub.wss.twitch.tv/ws");
    expect(logs.join("\n")).not.toContain("ACCESS-X");
  });

  it("espace de plus en plus les essais : 5 s, 10 s, 20 s, jusqu'à 60 s", async () => {
    const { sockets, last, flush, advance, feed, target } = setup(() => new Response(null, { status: 403 }));
    feed.open(target);
    const waits: number[] = [];
    for (const wait of [5000, 10_000, 20_000, 40_000, 60_000, 60_000]) {
      last().emit(welcome(`s${sockets.length}`));
      await flush();
      const before = sockets.length;
      await advance(wait - 1);
      expect(sockets).toHaveLength(before);
      await advance(1);
      expect(sockets).toHaveLength(before + 1);
      waits.push(wait);
    }
    expect(waits).toHaveLength(6);
  });

  it("ferme et réessaie quand il n'y a pas de jeton", async () => {
    const { sockets, requests, subscribed, advance } = setup(undefined, () => null);
    await subscribed();
    expect(requests).toEqual([]);
    expect(sockets[0]?.isClosed).toBe(true);
    await advance(5000);
    expect(sockets).toHaveLength(2);
  });

  it("réessaie quand le réseau tombe pendant l'abonnement, sans écrire le jeton", async () => {
    const { logs, sockets, subscribed, advance } = setup(() => {
      throw new Error("fetch failed");
    });
    await subscribed();
    expect(logs).toContain("Twitch : abonnement aux follows impossible (fetch failed).");
    expect(logs.join("\n")).not.toContain("ACCESS-X");
    await advance(5000);
    expect(sockets).toHaveLength(2);
  });
});

describe("quand la connexion tombe", () => {
  it("la rouvre au bout de 5 s, s'abonne de nouveau, et ne le dit qu'une fois", async () => {
    const { sockets, last, logs, requests, flush, advance, subscribed } = setup();
    await subscribed();
    sockets[0]?.drop();
    sockets[0]?.drop();
    expect(logs.filter((line) => line.includes("interrompu"))).toHaveLength(1);
    await advance(5000);
    expect(sockets).toHaveLength(2);
    last().emit(welcome("session-2"));
    await flush();
    expect(requests).toHaveLength(2);
    expect(JSON.parse(String(requests[1]?.init?.body)).transport.session_id).toBe("session-2");
  });

  it("dit une nouvelle coupure une fois la précédente rattrapée", async () => {
    const { sockets, last, logs, flush, advance, subscribed } = setup();
    await subscribed();
    sockets[0]?.drop();
    await advance(5000);
    last().emit(welcome("session-2"));
    await flush();
    last().drop();
    expect(logs.filter((line) => line.includes("interrompu"))).toHaveLength(2);
  });

  it("le dit sans écrire d'adresse ni de jeton", async () => {
    const { sockets, logs, subscribed } = setup();
    await subscribed();
    sockets[0]?.drop();
    expect(logs.at(-1)).toBe("Twitch : flux des évènements interrompu (connexion coupée), nouvel essai.");
  });

  it("repart de 5 s après un abonnement réussi", async () => {
    const { sockets, last, flush, advance, subscribed } = setup();
    await subscribed();
    sockets[0]?.drop();
    await advance(5000);
    last().emit(welcome("session-2"));
    await flush();
    last().drop();
    await advance(4999);
    expect(sockets).toHaveLength(2);
    await advance(1);
    expect(sockets).toHaveLength(3);
  });
});

describe("le silence de Twitch", () => {
  it("reconnecte quand rien ne vient depuis le délai annoncé (10 s) plus la moitié", async () => {
    const { sockets, advance, subscribed } = setup();
    await subscribed();
    await advance(14_999);
    expect(sockets).toHaveLength(1);
    await advance(1);
    expect(sockets[0]?.isClosed).toBe(true);
    await advance(5000);
    expect(sockets).toHaveLength(2);
  });

  it("attend plus longtemps quand Twitch annonce 30 s", async () => {
    const { feed, target, last, sockets, flush, advance } = setup();
    feed.open(target);
    last().emit(welcome("session-1", 30));
    await flush();
    await advance(44_999);
    expect(sockets[0]?.isClosed).toBe(false);
    await advance(1);
    expect(sockets[0]?.isClosed).toBe(true);
  });

  it("garde la connexion tant que Twitch dit « je suis là »", async () => {
    const { last, sockets, advance, subscribed } = setup();
    await subscribed();
    for (let turn = 0; turn < 6; turn += 1) {
      await advance(10_000);
      last().emit(keepaliveMessage);
    }
    expect(sockets).toHaveLength(1);
    expect(sockets[0]?.isClosed).toBe(false);
  });

  it("n'attend pas un bonjour plus de 15 s", async () => {
    const { feed, target, sockets, advance } = setup();
    feed.open(target);
    await advance(15_000);
    expect(sockets[0]?.isClosed).toBe(true);
  });
});

describe("la demande de Twitch de changer d'adresse (session_reconnect)", () => {
  it("ouvre l'adresse donnée, ne s'abonne pas de nouveau, et ferme l'ancienne au bonjour", async () => {
    const { sockets, last, requests, flush, subscribed } = setup();
    await subscribed();
    sockets[0]?.emit(reconnectMessage("wss://eventsub.example.test/ws?id=2"));
    expect(sockets).toHaveLength(2);
    expect(last().url).toBe("wss://eventsub.example.test/ws?id=2");
    expect(sockets[0]?.isClosed).toBe(false);
    last().emit(welcome("session-2"));
    await flush();
    expect(sockets[0]?.isClosed).toBe(true);
    expect(requests).toHaveLength(1);
  });

  it("continue de donner les follows après le changement, sans doublon", async () => {
    const { sockets, last, follows, flush, subscribed } = setup();
    await subscribed();
    sockets[0]?.emit(reconnectMessage("wss://eventsub.example.test/ws?id=2"));
    last().emit(welcome("session-2"));
    await flush();
    last().emit(follow("n1", "Alice"));
    sockets[0]?.emit(follow("n1", "Alice"));
    expect(follows).toEqual(["Alice"]);
  });

  it("ne se reconnecte pas quand l'ancienne adresse se ferme après le changement", async () => {
    const { sockets, last, logs, flush, subscribed, advance } = setup();
    await subscribed();
    sockets[0]?.emit(reconnectMessage("wss://eventsub.example.test/ws?id=2"));
    last().emit(welcome("session-2"));
    await flush();
    sockets[0]?.drop();
    await advance(10_000);
    expect(sockets).toHaveLength(2);
    expect(sockets[1]?.isClosed).toBe(false);
    expect(logs.some((line) => line.includes("interrompu"))).toBe(false);
  });
});

describe("les récompenses de points de chaîne", () => {
  const both: readonly TwitchTopic[] = ["follow", "reward"];
  const toBody = (request: { init: RequestInit | undefined } | undefined): Record<string, unknown> =>
    JSON.parse(String(request?.init?.body));

  it("s'abonne aux follows puis aux récompenses (version 1, pour la chaîne seulement), avec le même jeton", async () => {
    const { requests, wasForced, subscribed } = setup(undefined, undefined, both);
    await subscribed();
    expect(requests).toHaveLength(2);
    expect(toBody(requests[0]).type).toBe("channel.follow");
    const second = toBody(requests[1]);
    expect(second.type).toBe("channel.channel_points_custom_reward_redemption.add");
    expect(second.version).toBe("1");
    expect(second.condition).toEqual(JSON.parse('{"broadcaster_user_id":"68710381"}'));
    expect(second.transport).toEqual(JSON.parse('{"method":"websocket","session_id":"session-1"}'));
    expect(new Headers(requests[1]?.init?.headers).get("authorization")).toBe("Bearer ACCESS-X");
    expect(wasForced).toEqual([false]);
  });

  it("ne s'abonne qu'aux abonnements demandés : sans récompenses, une seule demande", async () => {
    const { requests, subscribed } = setup(undefined, undefined, ["follow"]);
    await subscribed();
    expect(requests.map((request) => toBody(request).type)).toEqual(["channel.follow"]);
  });

  it("dit chaque abonnement obtenu", async () => {
    const { logs, subscribed } = setup(undefined, undefined, both);
    await subscribed();
    expect(logs).toEqual([
      "Twitch : abonné aux follows (EventSub).",
      "Twitch : abonné aux récompenses de points de chaîne (EventSub).",
    ]);
  });

  it("donne le pseudo et le titre de chaque récompense, jamais le texte que le viewer y joint", async () => {
    const { last, events, flush, subscribed } = setup(undefined, undefined, both);
    await subscribed();
    last().emit(reward("r1", "Alice", "Clasher Fenysk", "un texte qui ne doit pas être lu"));
    last().emit(reward("r2", "Bob", "Réveiller Jean-Renard"));
    await flush();
    expect(events).toEqual([
      { kind: "reward", user: "Alice", title: "Clasher Fenysk" },
      { kind: "reward", user: "Bob", title: "Réveiller Jean-Renard" },
    ]);
    expect(JSON.stringify(events)).not.toContain("texte");
  });

  it("prend le login quand le nom affiché manque, et ignore une récompense sans titre ou sans pseudo", async () => {
    const { last, events, subscribed } = setup(undefined, undefined, both);
    await subscribed();
    last().emit(reward("r1", "Alice", "Clasher Fenysk", "", NOW, ["name"]));
    last().emit(reward("r2", "Alice", "Clasher Fenysk", "", NOW, ["reward"]));
    last().emit(reward("r3", "Alice", "Clasher Fenysk", "", NOW, ["name", "login"]));
    expect(events).toEqual([{ kind: "reward", user: "alice", title: "Clasher Fenysk" }]);
  });

  it("ne donne qu'une fois une récompense que Twitch répète, et ignore une rediffusion de plus de 10 min", async () => {
    const { last, events, subscribed } = setup(undefined, undefined, both);
    await subscribed();
    last().emit(reward("r1", "Alice", "Clasher Fenysk"));
    last().emit(reward("r1", "Alice", "Clasher Fenysk"));
    last().emit(reward("old", "Vieux", "Clasher Fenysk", undefined, NOW - 10 * 60_000 - 1));
    expect(events.map((event) => (event.kind === "reward" ? event.user : null))).toEqual(["Alice"]);
  });

  it("un abonnement refusé n'abat pas les autres : les follows continuent, et le refus est dit", async () => {
    const { logs, sockets, events, last, pending, subscribed } = setup(
      (body) => new Response(null, { status: body.type === "channel.follow" ? 202 : 403 }),
      undefined,
      both,
    );
    await subscribed();
    expect(logs).toEqual([
      "Twitch : abonné aux follows (EventSub).",
      "Twitch : abonnement aux récompenses de points de chaîne refusé (HTTP 403).",
    ]);
    expect(sockets[0]?.isClosed).toBe(false);
    expect(pending()).toBe(1);
    last().emit(follow("n1", "Alice"));
    expect(events).toEqual([{ kind: "follow", user: "Alice" }]);
  });

  it("ferme et réessaie quand aucun abonnement n'a réussi, même avec deux demandes", async () => {
    const { logs, sockets, advance, subscribed } = setup(
      () => new Response(null, { status: 403 }),
      undefined,
      both,
    );
    await subscribed();
    expect(logs.filter((line) => line.startsWith("Twitch : abonnement aux"))).toHaveLength(2);
    expect(sockets[0]?.isClosed).toBe(true);
    await advance(5000);
    expect(sockets).toHaveLength(2);
  });

  it("redemande un jeton forcé après un 401, et s'abonne aux deux avec lui", async () => {
    let calls = 0;
    const { requests, wasForced, logs, feed, target, last, flush } = setup(
      () => {
        calls += 1;
        return new Response(null, { status: calls === 1 ? 401 : 202 });
      },
      (isForced) => (isForced ? "ACCESS-FRESH" : "ACCESS-OLD"),
      both,
    );
    feed.open(target);
    last().emit(welcome("session-1"));
    await flush();
    expect(wasForced).toEqual([false, true]);
    expect(requests.map((request) => new Headers(request.init?.headers).get("authorization"))).toEqual([
      "Bearer ACCESS-OLD",
      "Bearer ACCESS-FRESH",
      "Bearer ACCESS-FRESH",
    ]);
    expect(logs).toHaveLength(2);
  });

  it("dit quel abonnement Twitch retire", async () => {
    const { last, logs, subscribed } = setup(undefined, undefined, both);
    await subscribed();
    last().emit(
      `{"metadata":{"message_id":"rv","message_type":"revocation","message_timestamp":"${iso(NOW)}","subscription_type":"channel.channel_points_custom_reward_redemption.add"},"payload":{"subscription":{"id":"s2","status":"authorization_revoked","type":"channel.channel_points_custom_reward_redemption.add"}}}`,
    );
    expect(logs).toContain(
      "Twitch : l'abonnement aux récompenses de points de chaîne a été retiré par Twitch (authorization_revoked).",
    );
  });

  it("se réabonne aux deux à chaque nouvelle connexion", async () => {
    const { sockets, last, requests, flush, advance, subscribed } = setup(undefined, undefined, both);
    await subscribed();
    sockets[0]?.drop();
    await advance(5000);
    last().emit(welcome("session-2"));
    await flush();
    expect(requests).toHaveLength(4);
    expect(requests.slice(2).map((request) => toBody(request).type)).toEqual([
      "channel.follow",
      "channel.channel_points_custom_reward_redemption.add",
    ]);
  });
});

describe("les prédictions terminées", () => {
  const all: readonly TwitchTopic[] = ["follow", "reward", "prediction"];

  it("s'abonne à la fin des prédictions (version 1, pour la chaîne seulement), après les follows et les récompenses", async () => {
    const { requests, logs, subscribed } = setup(undefined, undefined, all);
    await subscribed();
    expect(requests).toHaveLength(3);
    const body: Record<string, unknown> = JSON.parse(String(requests[2]?.init?.body));
    expect(body.type).toBe("channel.prediction.end");
    expect(body.version).toBe("1");
    expect(body.condition).toEqual(JSON.parse('{"broadcaster_user_id":"68710381"}'));
    expect(logs.at(-1)).toBe("Twitch : abonné aux prédictions (EventSub).");
  });

  it("donne les perdants (les viewers des issues perdantes) et l'issue perdante la plus suivie", async () => {
    const { last, events, subscribed } = setup(undefined, undefined, all);
    await subscribed();
    last().emit(
      prediction("p1", {
        winning: "o2",
        outcomes: [
          ["o1", "Oui", 3],
          ["o2", "Non", 7],
          ["o3", "Peut-être", 5],
        ],
      }),
    );
    expect(events).toEqual([{ kind: "prediction", losers: 8, outcome: "Peut-être" }]);
  });

  it("donne zéro perdant quand tout le monde a gagné", async () => {
    const { last, events, subscribed } = setup(undefined, undefined, all);
    await subscribed();
    last().emit(
      prediction("p1", {
        outcomes: [
          ["o1", "Oui", 4],
          ["o2", "Non", 0],
        ],
      }),
    );
    expect(events).toEqual([{ kind: "prediction", losers: 0, outcome: null }]);
  });

  it("ignore une prédiction annulée, même avec des viewers sur les issues", async () => {
    const { last, events, subscribed } = setup(undefined, undefined, all);
    await subscribed();
    last().emit(prediction("p1", { status: "canceled", winning: null }));
    last().emit(prediction("p2", { status: "canceled" }));
    expect(events).toEqual([]);
  });

  it("ignore une prédiction dont le résultat est illisible : issue gagnante inconnue, issues absentes", async () => {
    const { last, events, subscribed } = setup(undefined, undefined, all);
    await subscribed();
    last().emit(prediction("p1", { winning: "inconnue" }));
    last().emit(prediction("p2", { winning: null }));
    last().emit(prediction("p3", { outcomes: [] }));
    last().emit(
      '{"metadata":{"message_id":"p4","message_type":"notification","message_timestamp":"2026-10-13T12:00:00.000Z","subscription_type":"channel.prediction.end"},"payload":{"event":{"status":"resolved","winning_outcome_id":"o1"}}}',
    );
    expect(events).toEqual([]);
  });

  it("ne donne qu'une fois une prédiction que Twitch répète", async () => {
    const { last, events, subscribed } = setup(undefined, undefined, all);
    await subscribed();
    last().emit(prediction("p1"));
    last().emit(prediction("p1"));
    expect(events).toHaveLength(1);
  });

  it("un abonnement aux prédictions refusé n'abat ni les follows ni les récompenses", async () => {
    const { logs, sockets, events, last, subscribed } = setup(
      (body) => new Response(null, { status: body.type === "channel.prediction.end" ? 403 : 202 }),
      undefined,
      all,
    );
    await subscribed();
    expect(logs).toEqual([
      "Twitch : abonné aux follows (EventSub).",
      "Twitch : abonné aux récompenses de points de chaîne (EventSub).",
      "Twitch : abonnement aux prédictions refusé (HTTP 403).",
    ]);
    expect(sockets[0]?.isClosed).toBe(false);
    last().emit(follow("n1", "Alice"));
    expect(events).toEqual([{ kind: "follow", user: "Alice" }]);
  });
});

describe("close", () => {
  it("ferme les connexions, n'en rouvre pas, et ne donne plus de follow", async () => {
    const { feed, sockets, follows, pending, advance, subscribed } = setup();
    await subscribed();
    sockets[0]?.drop();
    feed.close();
    await advance(120_000);
    expect(sockets).toHaveLength(1);
    expect(pending()).toBe(0);
    sockets[0]?.emit(follow("n1", "Alice"));
    expect(follows).toEqual([]);
  });

  it("ferme la connexion qui sert et celle de la migration", async () => {
    const { feed, sockets, subscribed } = setup();
    await subscribed();
    sockets[0]?.emit(reconnectMessage("wss://eventsub.example.test/ws?id=2"));
    feed.close();
    expect(sockets.map(({ isClosed }) => isClosed)).toEqual([true, true]);
  });

  it("ne coupe rien par erreur quand il n'a jamais été ouvert", () => {
    const { feed } = setup();
    expect(() => feed.close()).not.toThrow();
  });
});
