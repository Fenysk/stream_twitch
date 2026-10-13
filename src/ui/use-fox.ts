import { type RefObject, useEffect, useRef, useState } from "react";
import { FOX_START, isFoxMuted, toFoxDisplay, toNextFox } from "../domain/fox.rules";
import {
  FOX_IMAGES,
  FoxEventSchema,
  type FoxImage,
  type FoxMode,
  type FoxPlace,
  type FoxRules,
} from "../domain/fox.schema";
import { IDLE_MODE } from "../domain/fox-mode.rules";
import { toFoxTransform } from "../domain/fox-transform.rules";
import { NO_JOY, toJoyBody } from "../domain/joy.rules";
import { MIRROR_START, toMirrorScale, toNextMirror } from "../domain/mirror.rules";
import { type PresencePose, toNextPose, toPresenceBody } from "../domain/presence.rules";
import { getSoundOutput, unlockSound } from "./fox-audio";
import { createFoxPlayer } from "./fox-player";
import { toFoxEventsUrl, toFoxImageUrl } from "./fox-urls";
import { getLoadedImage } from "./preload-images";

const RETRY_MS = 2000;
// Avant les règles, aucune durée de descente ni de saut : la pose part de là où il est.
const NO_CURVES = { crouchMs: 1, jumpMs: 1, diveMs: 1, returnMs: 1 };

const getSpeech = async (url: string): Promise<ArrayBuffer> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`voix introuvable (${response.status}) : ${url}`);
  return response.arrayBuffer();
};

type FoxLoopDeps = {
  place: FoxPlace;
  body: () => HTMLElement | null;
  onImage: (image: FoxImage) => void;
  onMuted: (isMuted: boolean) => void;
};

// Fait vivre le renard : les règles, les voix, le mode et la présence arrivent du flux du serveur ; à chaque image de
// l'écran, le pas de l'animation (domain) choisit l'image, l'échelle du corps et sa place (il glisse hors de la source,
// ou saute pour revenir). Rien ne s'affiche avant que les 12 images soient chargées
// (aucun clignotement au premier changement d'image). Rend de quoi tout arrêter.
const startFox = ({ place, body, onImage, onMuted }: FoxLoopDeps): (() => void) => {
  let isLive = true;
  let isReady = false;
  let rules: FoxRules | undefined;
  let state = FOX_START;
  let mode: FoxMode = IDLE_MODE;
  // Tourné vers Fenysk (mode `address`) : le corps se retourne, toutes les images en miroir.
  let mirror = MIRROR_START;
  // La phase de présence et l'instant de la page où elle a commencé (moins le temps déjà écoulé côté serveur).
  let pose: PresencePose = { kind: "visible", elapsed: 0, from: { offset: 0, angle: 0 } };
  let poseAt = 0;
  let shown: FoxImage | undefined;
  const output = getSoundOutput();
  const player =
    output &&
    createFoxPlayer({
      output,
      getSpeech,
      onError: (error) => console.error("Renard : la voix ne joue pas", error),
    });

  const preload = async () => {
    while (isLive && !isReady) {
      try {
        await Promise.all(FOX_IMAGES.map((name) => getLoadedImage(toFoxImageUrl(name))));
        isReady = true;
      } catch (error) {
        console.error("Renard : images non chargées, nouvel essai", error);
        await new Promise((done) => setTimeout(done, RETRY_MS));
      }
    }
  };

  const currentPose = (now: number): PresencePose => ({ ...pose, elapsed: pose.elapsed + now - poseAt });

  const source = new EventSource(toFoxEventsUrl(place));
  source.onmessage = (message: MessageEvent<string>) => {
    const parsed = FoxEventSchema.safeParse(JSON.parse(message.data));
    if (!parsed.success) {
      console.error("Message du serveur illisible :", parsed.error.message);
      return;
    }
    const foxEvent = parsed.data;
    switch (foxEvent.kind) {
      case "rules":
        rules = foxEvent.rules;
        break;
      case "speech":
        void player?.play(foxEvent.url);
        break;
      case "stop":
        player?.stop();
        break;
      case "mode":
        mode = foxEvent.mode;
        break;
      case "presence":
        pose = toNextPose(currentPose(performance.now()), foxEvent, rules ?? NO_CURVES);
        poseAt = performance.now();
        break;
      case "screens": {
        // Une page /fox est connectée (OBS) : l'aperçu se tait et n'anime que la bouche ; ça bascule seul.
        const isMuted = isFoxMuted({ place, screens: foxEvent.count });
        player?.setMuted(isMuted);
        onMuted(isMuted);
        break;
      }
    }
  };

  let animation = 0;
  const tick = (now: number) => {
    animation = requestAnimationFrame(tick);
    if (!isReady || !rules) return;
    state = toNextFox({
      previous: state,
      now,
      level: player?.getLevel() ?? null,
      rules,
      random: Math.random,
      mode,
    });
    const display = toFoxDisplay(state, now, rules);
    const presence = toPresenceBody(currentPose(now), rules);
    // Le saut de joie d'un sub : il part du moment où la page a reçu le mode.
    const joy = mode.kind === "joy" ? toJoyBody(now - (state.modeAt ?? now), rules.joyMs) : NO_JOY;
    mirror = toNextMirror(mirror, mode.kind === "address", now);
    if (display.image !== shown) {
      shown = display.image;
      onImage(display.image);
    }
    const element = body();
    if (element) {
      element.style.transform = toFoxTransform({
        offset: presence.offset + joy.offset,
        angle: presence.angle,
        scaleX: display.scaleX * presence.squashX * joy.squashX * toMirrorScale(mirror, now),
        scaleY: display.scaleY * presence.squashY * joy.squashY,
      });
    }
  };

  void preload();
  animation = requestAnimationFrame(tick);
  // Dans un navigateur ordinaire, le premier clic dans la page autorise le son (OBS n'en a pas besoin).
  window.addEventListener("pointerdown", unlockSound);
  return () => {
    isLive = false;
    cancelAnimationFrame(animation);
    source.close();
    player?.stop();
    window.removeEventListener("pointerdown", unlockSound);
  };
};

export type FoxView = {
  // L'image à montrer ; `null` tant que les images ne sont pas chargées ou que les règles n'ont pas encore été reçues.
  image: FoxImage | null;
  bodyRef: RefObject<HTMLDivElement | null>;
  // La voix ne sort pas de cette page : une autre page `/fox` est connectée et parle à sa place.
  isMuted: boolean;
};

export const useFox = (place: FoxPlace): FoxView => {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<FoxImage | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  useEffect(
    () => startFox({ place, body: () => bodyRef.current, onImage: setImage, onMuted: setIsMuted }),
    [place],
  );
  return { image, bodyRef, isMuted };
};
