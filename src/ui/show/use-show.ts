// La page `/show` côté navigateur : deux <video> (l'un joue pendant que l'autre charge le suivant), ce qu'elle montre, le tchat du clip
// qui joue et l'émission que le serveur annonce. Elle est transparente tant qu'il n'y en a pas. Une page rechargée en pleine émission la
// reprend au début.

import { type RefObject, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../../domain/chat.schema";
import type { FoxMode } from "../../domain/fox.schema";
import { watchShowState } from "../show-api";
import { NO_VIEW, type ShowView, type Slot } from "./show-view";
import { type Run, startRun } from "./start-run";

export type UseShow = {
  videos: readonly [RefObject<HTMLVideoElement | null>, RefObject<HTMLVideoElement | null>];
  view: ShowView;
  // Les messages du tchat du clip qui joue, tels qu'ils sont apparus : la colonne du tchat les affiche comme ceux du direct.
  chat: ChatMessage[];
};

// `setFoxMode` : ce que Jean-Renard montre en plus de sa bouche (il sursaute avec le son du clip) ; la page `/show` le lui donne seule.
// `setFoxFader` : le fader de sa voix, qui baisse comme le reste du son de l'émission.
export const useShow = (
  setFoxMode: (mode: FoxMode) => void,
  setFoxFader: (fader: number) => void,
): UseShow => {
  const first = useRef<HTMLVideoElement>(null);
  const second = useRef<HTMLVideoElement>(null);
  const [view, setView] = useState<ShowView>(NO_VIEW);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  // La dernière version de `setFoxMode`, que l'effet lit sans se relancer quand elle change.
  const foxMode = useRef(setFoxMode);
  foxMode.current = setFoxMode;
  const foxFader = useRef(setFoxFader);
  foxFader.current = setFoxFader;

  useEffect(() => {
    const page = {
      videoOf: (slot: Slot) => (slot === 0 ? first : second).current,
      setView,
      // Un message paraît au moment où le clip y arrive : il compte comme reçu maintenant, de quoi lui donner sa durée d'affichage.
      addChat: (messages: ChatMessage[]) => {
        if (messages.length === 0) return;
        const now = Date.now();
        setChat((current) => [...current, ...messages.map((message) => ({ ...message, receivedAt: now }))]);
      },
      clearChat: () => setChat([]),
      setFoxMode: (mode: FoxMode) => foxMode.current(mode),
      setFoxFader: (fader: number) => foxFader.current(fader),
    };
    let run: Run | undefined;
    const end = () => {
      run?.stop();
      run = undefined;
      setView(NO_VIEW);
    };
    // Le serveur dit l'état à la connexion puis à chaque changement ; une émission nouvelle (un autre `runId`) remplace la courante,
    // un état sans émission en cours (arrêtée, finie) coupe tout. Les rapports de la page elle-même reviennent avec le même `runId` :
    // seul le fader du son de l'émission y change quelque chose.
    const close = watchShowState(true, (state) => {
      if (state.status !== "running") {
        if (run) end();
        return;
      }
      if (run?.runId === state.runId) {
        run.updateFader(state.showFader);
        return;
      }
      end();
      run = startRun(state, page);
    });
    return () => {
      end();
      close();
    };
  }, []);

  return { videos: [first, second], view, chat };
};
