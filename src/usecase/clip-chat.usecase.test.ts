import { describe, expect, it } from "vitest";
import type { ChatEvent, ChatMessage } from "../domain/chat.schema";
import type { ClipChat } from "../domain/clip.schema";
import { type ChatFeedPort, type ClipChatStore, createClipChat, type ReplayPort } from "./clip-chat.usecase";

const FOLDER = "C:\\clips";
const CLIP = `${FOLDER}\\Replay 2026-10-15 15-09-05.mp4`;
const SAVED_AT = 5_000_000;

const message = (id: string, receivedAt: number, overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  nickname: "Viewer",
  color: null,
  fragments: [{ kind: "text", text: id }],
  isHidden: false,
  receivedAt,
  ...overrides,
});

// Un faux OBS, un faux tchat, un faux disque et un faux temps : le test les pilote à la main.
const setup = (
  options: { duration?: number | undefined; store?: "written" | "outside" | "missing" } = {},
) => {
  const state = { now: SAVED_AT - 200_000 };
  const feedListeners = new Set<(event: ChatEvent) => void>();
  const replayListeners = new Set<(event: { path: string }) => void>();
  const timers: { at: number; run: () => void; isCancelled: boolean }[] = [];
  const written: { folder: string; path: string; chat: ClipChat }[] = [];
  const logs: string[] = [];
  const chat: ChatFeedPort = {
    feed: {
      subscribe(listener) {
        feedListeners.add(listener);
        return () => feedListeners.delete(listener);
      },
    },
  };
  const replay: ReplayPort = {
    subscribe(listener) {
      replayListeners.add(listener);
      return () => replayListeners.delete(listener);
    },
  };
  const store: ClipChatStore = {
    create(folder, path, content) {
      written.push({ folder, path, chat: content });
      return options.store ?? "written";
    },
  };
  const keeper = createClipChat({
    chat,
    replay,
    probe: { probe: async () => ("duration" in options ? options.duration : 118.55) },
    store,
    clock: () => state.now,
    schedule: (run, ms) => {
      const timer = { at: state.now + ms, run, isCancelled: false };
      timers.push(timer);
      return () => {
        timer.isCancelled = true;
      };
    },
    log: (line) => logs.push(line),
  });
  keeper.update({ showClipsFolder: FOLDER });
  keeper.start();
  return {
    keeper,
    written,
    logs,
    // Un message du tchat arrive à `receivedAt` (l'horloge du serveur suit).
    receive(id: string, receivedAt: number, overrides: Partial<ChatMessage> = {}) {
      state.now = receivedAt;
      for (const listener of feedListeners)
        listener({ kind: "message", message: message(id, receivedAt, overrides) });
    },
    deleteMessage(id: string) {
      for (const listener of feedListeners) listener({ kind: "delete", messageIds: [id] });
    },
    // OBS dit « ReplayBufferSaved » à l'instant `at`.
    save(at: number, path = CLIP) {
      state.now = at;
      for (const listener of replayListeners) listener({ path });
    },
    // Le temps passe : les minuteurs échus partent, et on laisse finir ce qu'ils lancent (la sonde de ffprobe).
    async advanceTo(at: number) {
      state.now = at;
      for (const timer of timers.filter(({ at: dueAt, isCancelled }) => dueAt <= at && !isCancelled)) {
        timer.isCancelled = true;
        timer.run();
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
    listeners: { feed: feedListeners, replay: replayListeners },
  };
};

describe("le tchat gardé pour chaque clip sauvegardé", () => {
  it("écrit à côté du clip le tchat de [sauvegarde − durée du clip, sauvegarde + 10 s] 10 s après la sauvegarde", async () => {
    const { receive, save, advanceTo, written } = setup();
    receive("trop-ancien", SAVED_AT - 130_000);
    receive("dans-le-clip", SAVED_AT - 100_000);
    receive("juste-avant", SAVED_AT - 1000);
    save(SAVED_AT);
    receive("réaction", SAVED_AT + 5000);
    await advanceTo(SAVED_AT + 9999);
    expect(written).toEqual([]);
    receive("derniere-seconde", SAVED_AT + 9999);
    await advanceTo(SAVED_AT + 10_000);
    expect(written).toHaveLength(1);
    expect(written[0]?.folder).toBe(FOLDER);
    expect(written[0]?.path).toBe(CLIP);
    expect(written[0]?.chat.savedAt).toBe(SAVED_AT);
    expect(written[0]?.chat.messages.map(({ id }) => id)).toEqual([
      "dans-le-clip",
      "juste-avant",
      "réaction",
      "derniere-seconde",
    ]);
  });

  it("garde chaque message tel que la page du tchat le reçoit, même masqué", async () => {
    const { receive, save, advanceTo, written } = setup();
    const hidden = {
      isHidden: true,
      color: "#00ff00",
      fragments: [{ kind: "emote" as const, id: "25", name: "Kappa" }],
    };
    receive("bot", SAVED_AT - 2000, hidden);
    save(SAVED_AT);
    await advanceTo(SAVED_AT + 10_000);
    expect(written[0]?.chat.messages).toEqual([message("bot", SAVED_AT - 2000, hidden)]);
  });

  it("retire un message supprimé par la modération avant l'écriture", async () => {
    const { receive, deleteMessage, save, advanceTo, written } = setup();
    receive("gentil", SAVED_AT - 3000);
    receive("banni", SAVED_AT - 2000);
    save(SAVED_AT);
    deleteMessage("banni");
    await advanceTo(SAVED_AT + 10_000);
    expect(written[0]?.chat.messages.map(({ id }) => id)).toEqual(["gentil"]);
  });

  it("ne garde en mémoire que 3 minutes de tchat", async () => {
    const { receive, save, advanceTo, written } = setup({ duration: undefined });
    receive("ancien", SAVED_AT - 190_000);
    receive("récent", SAVED_AT - 170_000);
    save(SAVED_AT);
    await advanceTo(SAVED_AT + 10_000);
    expect(written[0]?.chat.messages.map(({ id }) => id)).toEqual(["récent"]);
  });

  it("écrit un tchat vide, avec l'heure de la sauvegarde, quand personne n'a écrit", async () => {
    const { save, advanceTo, written } = setup();
    save(SAVED_AT);
    await advanceTo(SAVED_AT + 10_000);
    expect(written[0]?.chat).toEqual({ savedAt: SAVED_AT, messages: [] });
  });

  it("garde un tchat par clip sauvegardé quand deux sauvegardes se suivent", async () => {
    const { receive, save, advanceTo, written } = setup();
    receive("a", SAVED_AT - 1000);
    save(SAVED_AT, `${FOLDER}\\un.mp4`);
    receive("b", SAVED_AT + 4000);
    save(SAVED_AT + 5000, `${FOLDER}\\deux.mp4`);
    await advanceTo(SAVED_AT + 20_000);
    expect(written.map(({ path }) => path)).toEqual([`${FOLDER}\\un.mp4`, `${FOLDER}\\deux.mp4`]);
    expect(written[0]?.chat.messages.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(written[1]?.chat.savedAt).toBe(SAVED_AT + 5000);
  });

  it("n'écrit rien tant que le dossier des clips n'est pas réglé", async () => {
    const { keeper, save, advanceTo, written, logs } = setup();
    keeper.update({});
    save(SAVED_AT);
    await advanceTo(SAVED_AT + 10_000);
    expect(written).toEqual([]);
    expect(logs.join("\n")).toContain("dossier des clips");
  });

  it("dit dans le journal un clip hors du dossier ou disparu, sans rien écrire de plus", async () => {
    const outside = setup({ store: "outside" });
    outside.save(SAVED_AT, "D:\\ailleurs\\clip.mp4");
    await outside.advanceTo(SAVED_AT + 10_000);
    expect(outside.logs.join("\n")).toContain("hors du dossier");

    const missing = setup({ store: "missing" });
    missing.save(SAVED_AT);
    await missing.advanceTo(SAVED_AT + 10_000);
    expect(missing.logs.join("\n")).toContain("introuvable");
  });

  it("annule les écritures en attente et se désabonne à l'arrêt", async () => {
    const { keeper, save, advanceTo, written, listeners } = setup();
    save(SAVED_AT);
    keeper.stop();
    await advanceTo(SAVED_AT + 10_000);
    expect(written).toEqual([]);
    expect(listeners.feed.size).toBe(0);
    expect(listeners.replay.size).toBe(0);
  });
});
