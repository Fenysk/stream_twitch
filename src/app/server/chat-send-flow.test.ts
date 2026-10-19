import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTwitchAuthClient } from "../../infra/twitch-auth.client";
import { CONNECT_MESSAGE, createChatWriterClient, RECONNECT_MESSAGE } from "../../infra/twitch-chat.client";
import { createTwitchTokenStore } from "../../infra/twitch-token.repository";
import { createControl, OBS_OFFLINE } from "../../usecase/control.usecase";
import { createTwitchConnection } from "../../usecase/twitch-connection.usecase";
import {
  FAKE_CLIENT_ID,
  FAKE_CODE,
  FAKE_SECRET,
  type FakeTwitch,
  startFakeTwitch,
} from "./fake-twitch.testkit";

const CHANNEL = "68710381";
// Les droits d'avant « Écrire » : un jeton gardé avant l'étape 2 de la régie n'a pas user:write:chat.
const PRE_CHAT_SCOPES = [
  "moderator:read:followers",
  "channel:manage:redemptions",
  "channel:read:predictions",
];

let fake: FakeTwitch;
let directory = "";

beforeEach(async () => {
  fake = await startFakeTwitch();
  directory = mkdtempSync(join(tmpdir(), "chat-send-flow-"));
});

afterEach(async () => {
  await fake.stop();
  rmSync(directory, { recursive: true, force: true });
});

// Le serveur câblé comme runtime.ts le fait pour « Écrire » (jeton en fichier, authentification, client Helix du chat, régie), mais
// contre le faux Twitch. Le flux EventSub n'est pas ce que ce test regarde : le flux ne fait rien.
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
  const chat = createChatWriterClient({
    clientId: FAKE_CLIENT_ID,
    broadcasterId: CHANNEL,
    getSender: (isForced) => connection.getChatSender(isForced),
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
    chat,
    chatViewers: { list: async () => ({ ok: true, chatViewers: [] }) },
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

describe("« Écrire » dans la régie, de bout en bout contre un faux Twitch", () => {
  it("Quand Alexis est connecté avec le droit d'écrire, le système doit publier le message dans le chat, au nom de son compte", async () => {
    const { control, login } = startStack();
    expect(await login()).toEqual({ ok: true, login: "fenysk" });
    expect(await control.sendMessage("Salut le chat")).toEqual({ ok: true });
    expect(fake.chatMessages()).toEqual([
      { broadcasterId: CHANNEL, senderId: CHANNEL, message: "Salut le chat" },
    ]);
    const [request] = fake.requestsTo("/helix/chat/messages");
    expect(request?.headers.authorization).toBe("Bearer fake-access-1");
    expect(request?.headers["client-id"]).toBe(FAKE_CLIENT_ID);
    // Twitch écrit les champs en snake_case : le corps attendu se compose depuis des paires.
    expect(JSON.parse(request?.body ?? "{}")).toEqual(
      Object.fromEntries([
        ["broadcaster_id", CHANNEL],
        ["sender_id", CHANNEL],
        ["message", "Salut le chat"],
      ]),
    );
  });

  it("Si le jeton gardé est d'avant le droit d'écrire, alors le système doit dire de reconnecter Twitch, sans rien envoyer à Twitch", async () => {
    fake.setScopes(PRE_CHAT_SCOPES);
    const { control, login } = startStack();
    await login();
    expect(await control.sendMessage("Salut")).toEqual({
      ok: false,
      status: 401,
      message: RECONNECT_MESSAGE,
    });
    expect(fake.requestsTo("/helix/chat/messages")).toEqual([]);
    expect(RECONNECT_MESSAGE).toBe(
      "Reconnecte Twitch dans l'onglet Twitch : l'écriture demande une autorisation de plus",
    );
  });

  it("Si Alexis n'est pas connecté, alors le système doit dire de connecter Twitch, sans rien envoyer à Twitch", async () => {
    const { control } = startStack();
    expect(await control.sendMessage("Salut")).toEqual({ ok: false, status: 401, message: CONNECT_MESSAGE });
    expect(fake.requestsTo("/helix/chat/messages")).toEqual([]);
  });

  it("Quand Twitch accepte le message sans le publier (mot bloqué), le système doit le dire avec sa raison", async () => {
    const { control, login } = startStack();
    await login();
    fake.rejectNextMessage("Le message contient un mot bloqué");
    expect(await control.sendMessage("Un mot interdit")).toEqual({
      ok: false,
      status: 422,
      message: "Twitch n'a pas publié le message (Le message contient un mot bloqué)",
    });
    expect(fake.chatMessages()).toEqual([]);
  });

  it("Quand Twitch retire le jeton, le système doit réessayer avec un autre, puis dire de connecter Twitch s'il n'y en a plus", async () => {
    const { control, login, logs } = startStack();
    await login();
    fake.revokeEverything();
    expect(await control.sendMessage("Salut")).toEqual({ ok: false, status: 401, message: CONNECT_MESSAGE });
    expect(fake.requestsTo("/helix/chat/messages")).toHaveLength(1);
    expect(logs.join("\n")).not.toContain("fake-access");
    expect(logs.join("\n")).not.toContain("fake-refresh");
  });

  it("n'écrit jamais le message dans le journal", async () => {
    const { control, login, logs } = startStack();
    await login();
    await control.sendMessage("Un secret de stream");
    expect(logs.join("\n")).not.toContain("Un secret de stream");
    expect(logs).toContain("Régie : message envoyé au chat (19 caractères).");
  });
});
