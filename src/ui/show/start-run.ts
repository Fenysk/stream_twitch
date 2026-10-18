// Une émission côté navigateur : le déroulé de show-run.ts branché sur les deux <video>, sur le serveur et sur l'horloge. Une émission
// qui s'arrête (la source n'est plus visible, une autre émission commence) coupe tout de suite ses vidéos, ses rires, ses minuteurs et
// sa voix, et libère les fichiers de rire.

import type { ChatMessage } from "../../domain/chat.schema";
import type { FoxMode } from "../../domain/fox.schema";
import { IDLE_MODE, STARTLE_MODE } from "../../domain/fox-mode.rules";
import type { ShowState } from "../../domain/show.schema";
import { getShowCues, reportShowProgress, speakInShow, toShowVideoUrl } from "../show-api";
import { createShowFader } from "./show-fader";
import { createLaughFiles } from "./show-laugh";
import { runEpisode } from "./show-run";
import { createShowTicker } from "./show-ticker";
import { playVideo, prepareVideo } from "./show-video";
import type { ShowView, Slot } from "./show-view";

// Ce que la page prête à l'émission : ses deux <video>, de quoi changer ce qu'elle montre, le tchat du clip qui joue (les messages qui
// paraissent, `clearChat` quand le clip change) et ce que Jean-Renard montre (il sursaute) et dit (le fader de sa voix).
export type ShowPage = {
  videoOf(slot: Slot): HTMLVideoElement | null;
  setView(view: ShowView): void;
  // L'instant estimé (ms de l'horloge du PC) où Fenysk revient.
  setReturnAt(at: number): void;
  addChat(messages: ChatMessage[]): void;
  clearChat(): void;
  setFoxMode(mode: FoxMode): void;
  setFoxFader(fader: number): void;
};

// `updateFader` : le serveur dit un nouveau fader pour tout le son de l'émission ; la page y fond en `TALK_FADE_MS`.
export type Run = { runId: string; updateFader(fader: number): void; stop(): void };

// Le fondu du tchat dure 0,8 s (show-stage.css) : une marge de plus, puis ses messages partent.
const CHAT_CLEAR_MS = 1000;

export const startRun = ({ runId, lineup, startsAt, showFader }: ShowState, page: ShowPage): Run => {
  let isStopped = false;
  // Ce qui attend (un minuteur, une vidéo ou des rires qui jouent) et que l'arrêt réveille aussitôt.
  const wakes = new Set<() => void>();
  const aborted = new Promise<void>((resolve) => wakes.add(resolve));
  const laughFiles = createLaughFiles(aborted);
  // Tout le son de l'émission baisse tant que Fenysk parle : le fader de départ est posé tout de suite, les suivants viennent en fondu,
  // le même pas pour les vidéos, les rires et la voix de Jean-Renard.
  const fader = createShowFader((next) => {
    for (const video of [page.videoOf(0), page.videoOf(1)]) if (video) video.volume = next / 100;
    laughFiles.setFader(next);
    page.setFoxFader(next);
  }, showFader);
  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      const wake = () => {
        clearTimeout(timer);
        wakes.delete(wake);
        resolve();
      };
      const timer = setTimeout(wake, ms);
      wakes.add(wake);
    });

  // Jean-Renard sursaute le temps d'une réaction, puis reprend son repos ; un arrêt le calme tout de suite.
  const startle = (ms: number) => {
    page.setFoxMode(STARTLE_MODE);
    void sleep(ms).then(() => page.setFoxMode(IDLE_MODE));
  };

  const play = (): Promise<void> =>
    runEpisode(
      {
        screen: {
          setView: (view) => {
            if (isStopped) return;
            page.setView(view);
            // Le tchat du clip qui finit s'efface une fois le fondu fini : le clip suivant n'en montre rien, même pas un message qui part.
            if (view.kind === "card") void sleep(CHAT_CLEAR_MS).then(() => page.clearChat());
          },
          setReturnAt: (at) => {
            if (!isStopped) page.setReturnAt(at);
          },
          // Les fichiers de rire du clip se téléchargent pendant que sa vidéo se charge, avant qu'il joue.
          load: async (slot, clip) => {
            const video = page.videoOf(slot);
            if (isStopped || video === null) return false;
            const [isReady] = await Promise.all([
              prepareVideo(video, toShowVideoUrl(clip.name, clip.version)),
              laughFiles.prepare(clip.laughs),
            ]);
            return isReady;
          },
          // La vidéo finie, les rires pas encore partis partent, et la dernière image reste jusqu'à la fin du dernier rire.
          play: async (slot, cues, laughs) => {
            const video = page.videoOf(slot);
            if (isStopped || !video) return false;
            page.clearChat();
            const laughing: Promise<boolean>[] = [];
            const ticker = createShowTicker(
              { cues, laughs },
              {
                addChat: page.addChat,
                startle,
                startLaugh: (laugh) => laughing.push(laughFiles.play(laugh)),
              },
            );
            await playVideo(video, aborted, ticker.tick);
            if (!isStopped) ticker.end();
            return (await Promise.all(laughing)).some(Boolean);
          },
        },
        loadCues: async ({ name, version }) => {
          const answer = await getShowCues(name, version);
          return answer.ok ? answer.value : null;
        },
        speak: async (speech) => {
          const answer = await speakInShow({ runId, ...speech });
          if (!answer.ok) throw new Error(answer.message);
          return answer.value;
        },
        report: (progress) => void reportShowProgress({ runId, ...progress }),
        sleep,
        now: Date.now,
        isStopped: () => isStopped,
        log: (message) => console.log(message),
      },
      lineup,
    ).finally(() => laughFiles.clear());

  // L'ouverture attend la fin de la sortie de Jean-Renard hors de /fox ; arrêtée avant, l'émission ne part jamais. Sans attente
  // (page rechargée en pleine émission), elle part tout de suite.
  const waitMs = Math.max(0, startsAt - Date.now());
  if (waitMs === 0) void play();
  else void sleep(waitMs).then(() => (isStopped ? undefined : play()));

  return {
    runId,
    updateFader(next) {
      if (!isStopped) fader.update(next);
    },
    stop() {
      isStopped = true;
      fader.stop();
      for (const wake of [...wakes]) wake();
      page.videoOf(0)?.pause();
      page.videoOf(1)?.pause();
      page.clearChat();
      page.setFoxMode(IDLE_MODE);
      laughFiles.clear();
    },
  };
};
