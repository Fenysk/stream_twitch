import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ChatEvent, ChatMessage } from "../../domain/chat.schema";
import { ClipChatSchema } from "../../domain/clip.schema";
import {
  CONFIRMED_FOLDER,
  createClipChatStore,
  createClipStore,
  PROCESSED_FOLDER,
} from "../../infra/clip.repository";
import { createObsClient, type ObsSocket } from "../../infra/obs.client";
import { createClipLibrary } from "../../usecase/clip.usecase";
import { createClipAnalysis } from "../../usecase/clip-analysis.usecase";
import { createClipChat } from "../../usecase/clip-chat.usecase";

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const message = (id: string, receivedAt: number): ChatMessage => ({
  id,
  nickname: "Viewer",
  color: "#112233",
  fragments: [{ kind: "text", text: `message ${id}` }],
  isHidden: false,
  receivedAt,
});

const SAVED_AT = 10_000_000;

// Le serveur câblé comme runtime.ts le fait pour l'émission : un faux OBS, un faux tchat, un vrai dossier de clips jetable.
const startStack = () => {
  const folder = mkdtempSync(join(tmpdir(), "clip-chat-flow-"));
  folders.push(folder);
  const logs: string[] = [];
  const replayListeners: ((path: string) => void)[] = [];
  const noop = () => undefined;
  const socket: ObsSocket = {
    connect: async () => ({ ok: false, isPasswordRefused: false, reason: "test" }),
    listPages: async () => [],
    refreshPage: async () => undefined,
    getProgramScene: async () => "Scène",
    listScenes: async () => [],
    updateProgramScene: async () => undefined,
    listSceneItems: async () => [],
    onSceneChanged: noop,
    onLevels: noop,
    getInputMute: async () => false,
    onInputMute: noop,
    getStreamStatus: async () => ({ isLive: false, durationMs: 0 }),
    onStreamState: noop,
    onReplaySaved: (listener) => replayListeners.push(listener),
    onExitStarted: noop,
    onClosed: noop,
  };
  const obs = createObsClient(
    { address: "ws://test", micName: "Mic", pageHosts: [], log: (line) => logs.push(line), onExit: noop },
    socket,
  );
  const state = { now: SAVED_AT - 150_000 };
  const feed = new Set<(event: ChatEvent) => void>();
  const timers: { at: number; run: () => void }[] = [];
  const probe = { probe: async () => 118.55 };
  const keeper = createClipChat({
    chat: {
      feed: {
        subscribe(listener) {
          feed.add(listener);
          return () => feed.delete(listener);
        },
      },
    },
    replay: obs.replay,
    probe,
    store: createClipChatStore(),
    clock: () => state.now,
    schedule: (run, ms) => {
      const timer = { at: state.now + ms, run };
      timers.push(timer);
      return () => undefined;
    },
    log: (line) => logs.push(line),
  });
  keeper.update({ showClipsFolder: folder });
  keeper.start();
  const store = createClipStore((line) => logs.push(line));
  const library = createClipLibrary({
    store,
    probe,
    analysis: createClipAnalysis({
      store,
      probe,
      levels: { listLevels: async () => undefined },
      log: (line) => logs.push(line),
    }),
    // Le recodage de ffmpeg est remplacé par un fichier : ce test ne regarde que le rangement.
    encoder: {
      trim: async ({ outputPath }) => {
        writeFileSync(outputPath, "recodé");
        return { ok: true, encoder: "test" };
      },
    },
    clock: () => state.now,
    log: (line) => logs.push(line),
  });
  library.update({ showClipsFolder: folder });
  return {
    folder,
    logs,
    library,
    receive(id: string, receivedAt: number) {
      state.now = receivedAt;
      for (const listener of feed) listener({ kind: "message", message: message(id, receivedAt) });
    },
    // OBS sauvegarde le tampon de relecture : le clip arrive sur le disque, puis l'évènement ReplayBufferSaved part.
    saveReplay(name: string) {
      state.now = SAVED_AT;
      const path = join(folder, name);
      writeFileSync(path, "vidéo brute");
      for (const listener of replayListeners) listener(path.replaceAll("\\", "/"));
    },
    async advanceTo(at: number) {
      state.now = at;
      for (const timer of timers.splice(0).filter(({ at: dueAt }) => dueAt <= at)) timer.run();
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
};

const names = (folder: string): string[] => (existsSync(folder) ? readdirSync(folder).sort() : []);

describe("le tchat d'un clip, de l'évènement d'OBS jusqu'au rangement du clip", () => {
  it("écrit le tchat à côté du clip brut 10 s après ReplayBufferSaved, dans le format que la page du tchat reçoit", async () => {
    const stack = startStack();
    stack.receive("avant-le-clip", SAVED_AT - 140_000);
    stack.receive("pendant", SAVED_AT - 30_000);
    stack.saveReplay("Replay 2026-10-15 15-09-05.mp4");
    stack.receive("réaction", SAVED_AT + 4000);
    await stack.advanceTo(SAVED_AT + 10_000);
    expect(names(stack.folder)).toEqual([
      "Replay 2026-10-15 15-09-05.chat.json",
      "Replay 2026-10-15 15-09-05.mp4",
    ]);
    const written = ClipChatSchema.parse(
      JSON.parse(readFileSync(join(stack.folder, "Replay 2026-10-15 15-09-05.chat.json"), "utf8")),
    );
    expect(written.savedAt).toBe(SAVED_AT);
    expect(written.messages.map(({ id }) => id)).toEqual(["pendant", "réaction"]);
  });

  it("suit le clip quand on le valide : copié à côté du clip confirmé, original rangé avec le clip brut dans Traités", async () => {
    const stack = startStack();
    stack.receive("pendant", SAVED_AT - 30_000);
    stack.saveReplay("Replay.mp4");
    await stack.advanceTo(SAVED_AT + 10_000);

    const confirmed = await stack.library.confirm({
      name: "Replay.mp4",
      title: "Le clip",
      phrase: "",
      endPhrase: "",
      start: 0,
      end: 60,
    });
    expect(confirmed).toEqual({ ok: true, value: { name: "Replay.mp4" } });
    expect(names(join(stack.folder, CONFIRMED_FOLDER))).toEqual([
      "Replay.chat.json",
      "Replay.json",
      "Replay.mp4",
    ]);
    expect(names(join(stack.folder, PROCESSED_FOLDER))).toEqual(["Replay.chat.json", "Replay.mp4"]);
    expect(names(stack.folder)).toEqual([CONFIRMED_FOLDER, PROCESSED_FOLDER]);
    const copy = ClipChatSchema.parse(
      JSON.parse(readFileSync(join(stack.folder, CONFIRMED_FOLDER, "Replay.chat.json"), "utf8")),
    );
    expect(copy.messages.map(({ id }) => id)).toEqual(["pendant"]);
  });

  it("suit le clip quand on le jette : rangé avec lui dans Traités, rien dans Confirmés", async () => {
    const stack = startStack();
    stack.saveReplay("Replay.mp4");
    await stack.advanceTo(SAVED_AT + 10_000);
    expect((await stack.library.discard("Replay.mp4")).ok).toBe(true);
    expect(names(join(stack.folder, PROCESSED_FOLDER))).toEqual(["Replay.chat.json", "Replay.mp4"]);
    expect(existsSync(join(stack.folder, CONFIRMED_FOLDER))).toBe(false);
  });

  it("ne touche pas aux clips d'un autre dossier que celui des réglages", async () => {
    const stack = startStack();
    const other = mkdtempSync(join(tmpdir(), "clip-chat-other-"));
    folders.push(other);
    mkdirSync(join(other, "sous"));
    writeFileSync(join(other, "Replay.mp4"), "brut");
    stack.saveReplay("Replay.mp4");
    await stack.advanceTo(SAVED_AT + 10_000);
    expect(names(other)).toEqual(["Replay.mp4", "sous"]);
  });
});
