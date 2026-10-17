import type { ChatEvent, ChatMessage } from "../domain/chat.schema";
import type { ClipChat } from "../domain/clip.schema";
import { CHAT_AFTER_MS, toClipChat, toKeptMessages } from "../domain/clip-chat.rules";
import type { ClipProbe, ClipSettings } from "./clip.usecase";

// Le tchat vu d'ici : ses messages et leurs suppressions, tels que les pages les reçoivent (Chat.feed).
export type ChatFeedPort = {
  feed: { subscribe(listener: (event: ChatEvent) => void): () => void };
};

// OBS dit qu'il vient de sauvegarder le tampon de relecture (évènement ReplayBufferSaved) : `path` est le clip qu'il a écrit.
export type ReplayPort = { subscribe(listener: (event: { path: string }) => void): () => void };

// Écrit `<nom du clip>.chat.json` à côté du clip, s'il est directement dans `folder` et s'il existe. Peut lever (disque).
export type ClipChatStore = {
  create(folder: string, clipPath: string, chat: ClipChat): "written" | "outside" | "missing";
};

export type ClipChatDeps = {
  chat: ChatFeedPort;
  replay: ReplayPort;
  probe: ClipProbe;
  store: ClipChatStore;
  clock: () => number;
  // Programme `callback` dans `ms` ; rend de quoi l'annuler.
  schedule: (callback: () => void, ms: number) => () => void;
  log: (message: string) => void;
};

export type ClipChatKeeper = {
  update(settings: ClipSettings): void;
  start(): void;
  stop(): void;
};

const toMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// Le tchat de chaque clip sauvegardé par OBS : le serveur garde les messages des 3 dernières minutes en mémoire ; 10 s après la
// sauvegarde (les réactions arrivent après le clic), il écrit ceux du clip à côté de lui. Rien ne s'affiche encore.
export function createClipChat({
  chat,
  replay,
  probe,
  store,
  clock,
  schedule,
  log,
}: ClipChatDeps): ClipChatKeeper {
  let folder: string | undefined;
  let kept: ChatMessage[] = [];
  let unsubscribers: (() => void)[] = [];
  const pending = new Set<() => void>();

  const receive = (event: ChatEvent) => {
    if (event.kind === "message") kept = [...toKeptMessages(kept, clock()), event.message];
    else if (event.kind === "delete") kept = kept.filter(({ id }) => !event.messageIds.includes(id));
  };

  const write = async (path: string, savedAt: number): Promise<void> => {
    if (folder === undefined) {
      log(`Clips : tchat de « ${path} » non gardé, le dossier des clips n'est pas réglé.`);
      return;
    }
    try {
      const seconds = await probe.probe(path);
      const content = toClipChat(kept, savedAt, seconds === undefined ? undefined : seconds * 1000);
      const result = store.create(folder, path, content);
      if (result === "written")
        log(`Clips : ${content.messages.length} message(s) du tchat gardés avec « ${path} ».`);
      else if (result === "outside")
        log(`Clips : « ${path} » est hors du dossier des clips, son tchat n'est pas gardé.`);
      else
        log(
          `Clips : « ${path} » est introuvable (ou n'est ni un .mp4, ni un .mkv, ni un .mov), son tchat n'est pas gardé.`,
        );
    } catch (error) {
      log(`Clips : tchat de « ${path} » impossible à garder, ${toMessage(error)}`);
    }
  };

  const onSaved = ({ path }: { path: string }) => {
    const savedAt = clock();
    const cancel = schedule(() => {
      pending.delete(cancel);
      void write(path, savedAt);
    }, CHAT_AFTER_MS);
    pending.add(cancel);
  };

  return {
    update(settings) {
      folder = settings.showClipsFolder;
    },
    start() {
      unsubscribers = [chat.feed.subscribe(receive), replay.subscribe(onSaved)];
    },
    stop() {
      for (const unsubscribe of unsubscribers) unsubscribe();
      unsubscribers = [];
      for (const cancel of pending) cancel();
      pending.clear();
    },
  };
}
