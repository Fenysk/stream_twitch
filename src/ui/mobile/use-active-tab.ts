// L'onglet est-il celui qui a la main sur ce téléphone ? Le dernier onglet ouvert ou ramené au premier plan la prend (voir active-tab.ts) ;
// celui qui la perd est démonté par la page, ce qui coupe sa caméra, son flux avec le serveur et ses liaisons WebRTC.

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  type ActiveTab,
  type ChannelPort,
  createActiveTab,
  type LocksPort,
  type VisibilityPort,
} from "./active-tab";
import { createRandomId } from "./random-id";

export type ActiveTabView = {
  isActive: boolean;
  // « Reprendre ici » : cet onglet prend la main.
  take: () => void;
};

const CHANNEL_NAME = "stream-twitch:mobile:active-tab";

const ClaimSchema = z.object({ at: z.number(), id: z.string() });

// Web Locks n'existe que dans un contexte sécurisé (HTTPS, localhost) : ailleurs, le navigateur n'offre pas `navigator.locks`.
const toLocksPort = (): LocksPort | null =>
  typeof navigator !== "undefined" && navigator.locks
    ? { steal: (name, hold) => navigator.locks.request(name, { steal: true }, hold) }
    : null;

const toChannelPort = (): ChannelPort | null => {
  if (typeof BroadcastChannel === "undefined") return null;
  const channel = new BroadcastChannel(CHANNEL_NAME);
  return {
    post: (claim) => channel.postMessage(claim),
    subscribe(listener) {
      const onMessage = (event: MessageEvent<unknown>) => {
        const parsed = ClaimSchema.safeParse(event.data);
        if (parsed.success) listener(parsed.data);
      };
      channel.addEventListener("message", onMessage);
      return () => channel.removeEventListener("message", onMessage);
    },
    close: () => channel.close(),
  };
};

const toVisibilityPort = (): VisibilityPort => ({
  isVisible: () => document.visibilityState === "visible",
  subscribe(onVisible) {
    const onChange = () => {
      if (document.visibilityState === "visible") onVisible();
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  },
});

export const useActiveTab = (): ActiveTabView => {
  // Actif tant qu'on ne lui a rien dit : la première peinture (et le serveur) montrent la page.
  const [isActive, setIsActive] = useState(true);
  const tab = useRef<ActiveTab | null>(null);

  useEffect(() => {
    const locks = toLocksPort();
    const created = createActiveTab({
      locks,
      channel: locks ? null : toChannelPort(),
      visibility: toVisibilityPort(),
      clock: Date.now,
      createId: createRandomId,
      onChange: setIsActive,
      log: (message) => console.warn(message),
    });
    tab.current = created;
    return () => {
      created.close();
      tab.current = null;
    };
  }, []);

  const take = useCallback(() => tab.current?.take(), []);
  return { isActive, take };
};
