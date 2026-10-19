import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTwitchAuthClient } from "../../infra/twitch-auth.client";
import {
  CONNECT_MESSAGE,
  createChatViewersClient,
  RECONNECT_MESSAGE,
} from "../../infra/twitch-chat-viewers.client";
import { createTwitchTokenStore } from "../../infra/twitch-token.repository";
import { createControl, OBS_OFFLINE } from "../../usecase/control.usecase";
import { createTwitchConnection } from "../../usecase/twitch-connection.usecase";
import {
  FAKE_CLIENT_ID,
  FAKE_CODE,
  FAKE_SECRET,
  type FakeChatViewer,
  type FakeTwitch,
  startFakeTwitch,
} from "./fake-twitch.testkit";

const CHANNEL = "68710381";
// Les droits d'avant la liste du chat : un jeton gardé avant l'étape de la liste des viewers n'a pas moderator:read:chatters.
const PRE_CHAT_VIEWERS_SCOPES = [
  "moderator:read:followers",
  "channel:manage:redemptions",
  "channel:read:predictions",
  "user:write:chat",
];

const viewer = (id: string, name: string): FakeChatViewer => ({ id, login: name.toLowerCase(), name });

let fake: FakeTwitch;
let directory = "";

beforeEach(async () => {
  fake = await startFakeTwitch();
  directory = mkdtempSync(join(tmpdir(), "chatViewers-flow-"));
});

afterEach(async () => {
  await fake.stop();
  rmSync(directory, { recursive: true, force: true });
});

// Le serveur câblé comme runtime.ts le fait pour la liste des viewers (jeton en fichier, authentification, client Helix de la liste, régie),
// mais contre le faux Twitch. Le flux EventSub n'est pas ce que ce test regarde : le flux ne fait rien.
const startStack = () => {
  const logs: string[] = [];
  const connection = createTwitchConnection({
    app: {
      clientId: FAKE_CLIENT_ID,
      auth: createTwitchAuthClient({
        clientId: FAKE_CLIENT_ID,
        clientSecret: FAKE_SECRET,
        idUrl: fake.httpUrl,
      }),
      feed: { open: () => undefined, close: () => undefined },
    },
    store: createTwitchTokenStore(join(directory, "data", "twitch-token.json"), (line) => logs.push(line)),
    broadcasterId: CHANNEL,
    onEvent: () => undefined,
    clock: Date.now,
    schedule: () => () => undefined,
    createState: () => "state-1",
    log: (line) => logs.push(line),
  });
  const chatViewers = createChatViewersClient({
    clientId: FAKE_CLIENT_ID,
    broadcasterId: CHANNEL,
    getReader: (isForced) => connection.getChatViewersReader(isForced),
    apiUrl: fake.httpUrl,
  });
  const noop = () => () => undefined;
  const control = createControl({
    obs: {
      subscribe: noop,
      getState: async () => OBS_OFFLINE,
      updateProgramScene: async () => ({ ok: true }),
      updateInputMute: async () => ({ ok: true }),
      stopStream: async () => ({ ok: true }),
      updatePicture: async () => ({ ok: true }),
    },
    broadcast: { subscribe: noop },
    viewers: { getState: () => ({ kind: "unknown" }), subscribe: noop },
    phones: { getState: () => [], subscribe: noop },
    chat: { send: async () => ({ ok: true }) },
    chatViewers,
    end: { update: () => ({ ok: true }) },
    settings: { micName: "Mic/Aux" },
    listen: () => undefined,
    clock: Date.now,
    schedule: () => () => undefined,
    log: (line) => logs.push(line),
  });
  // Alexis autorise sur Twitch : le navigateur revient avec le code et le state de la demande.
  const login = async () => {
    const begun = connection.beginLogin();
    if (!begun.ok) throw new Error(begun.message);
    const state = new URL(begun.url).searchParams.get("state");
    return connection.completeLogin({ code: FAKE_CODE, state, error: null });
  };
  return { connection, control, logs, login };
};

describe("la liste des viewers de la régie, de bout en bout contre un faux Twitch", () => {
  it("Quand Alexis est connecté avec le droit de lire la liste, le système doit rendre les personnes du chat triées par pseudo", async () => {
    fake.setChatViewers([viewer("3", "Zoé"), viewer("1", "alice"), viewer("2", "Bob")]);
    const { control, login } = startStack();
    expect(await login()).toEqual({ ok: true, login: "fenysk" });
    expect(await control.listChatViewers()).toEqual({
      ok: true,
      chatViewers: [
        { id: "1", nickname: "alice" },
        { id: "2", nickname: "Bob" },
        { id: "3", nickname: "Zoé" },
      ],
    });
  });

  it("demande la liste avec le jeton d'Alexis, la chaîne et son compte de modérateur", async () => {
    const { control, login } = startStack();
    await login();
    await control.listChatViewers();
    const [request] = fake.requestsTo("/helix/chat/chatters");
    expect(request?.method).toBe("GET");
    expect(request?.headers.authorization).toBe("Bearer fake-access-1");
    expect(request?.headers["client-id"]).toBe(FAKE_CLIENT_ID);
    expect(request?.query).toContain(`broadcaster_id=${CHANNEL}`);
    expect(request?.query).toContain(`moderator_id=${CHANNEL}`);
  });

  it("suit la pagination de Twitch : trois pages de deux personnes, toutes dans la liste", async () => {
    fake.setChatViewers([
      viewer("1", "Alice"),
      viewer("2", "Bob"),
      viewer("3", "Chloé"),
      viewer("4", "Dora"),
      viewer("5", "Eva"),
    ]);
    fake.setChatViewersPageSize(2);
    const { control, login } = startStack();
    await login();
    const result = await control.listChatViewers();
    expect(result.ok && result.chatViewers.map(({ nickname }) => nickname)).toEqual([
      "Alice",
      "Bob",
      "Chloé",
      "Dora",
      "Eva",
    ]);
    const queries = fake.requestsTo("/helix/chat/chatters").map(({ query }) => new URLSearchParams(query));
    expect(queries.map((query) => query.get("after"))).toEqual([null, "2", "4"]);
  });

  it("rend une liste vide quand personne n'est connecté au chat", async () => {
    const { control, login } = startStack();
    await login();
    expect(await control.listChatViewers()).toEqual({ ok: true, chatViewers: [] });
  });

  it("Si le jeton gardé est d'avant le droit de lire la liste, alors le système doit dire de reconnecter Twitch, sans rien demander à Twitch", async () => {
    fake.setScopes(PRE_CHAT_VIEWERS_SCOPES);
    const { control, login } = startStack();
    await login();
    expect(await control.listChatViewers()).toEqual({ ok: false, status: 401, message: RECONNECT_MESSAGE });
    expect(fake.requestsTo("/helix/chat/chatters")).toEqual([]);
    expect(RECONNECT_MESSAGE).toBe(
      "Reconnecte Twitch dans l'onglet Twitch : la liste demande une autorisation de plus",
    );
  });

  it("Si Alexis n'est pas connecté, alors le système doit dire de connecter Twitch, sans rien demander à Twitch", async () => {
    const { control } = startStack();
    expect(await control.listChatViewers()).toEqual({ ok: false, status: 401, message: CONNECT_MESSAGE });
    expect(fake.requestsTo("/helix/chat/chatters")).toEqual([]);
  });

  it("garde l'écriture dans le chat quand le jeton n'a pas le droit de lire la liste : les deux droits sont séparés", async () => {
    fake.setScopes(PRE_CHAT_VIEWERS_SCOPES);
    const { connection, login } = startStack();
    await login();
    expect((await connection.getChatSender(false)).ok).toBe(true);
    expect((await connection.getChatViewersReader(false)).ok).toBe(false);
  });
});
