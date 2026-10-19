import { useEffect, useState } from "react";
import {
  type FilmStart,
  type PhoneLayout,
  toAlertRole,
  toFilmStart,
  toPhoneLayout,
} from "../../domain/phone-layout.rules";
import type { ShownAlert } from "./alert-line";
import { useAlert } from "./use-alert";
import { type BannerMenuState, useBannerMenu } from "./use-banner-menu";
import { type CameraStream, useCameraStream } from "./use-camera-stream";
import { useCutCamera } from "./use-cut-camera";
import { type PhoneLink, usePhoneLink } from "./use-phone-link";
import { usePortrait } from "./use-portrait";
import { type UseToast, useToast } from "./use-toast";
import { useWakeLock } from "./use-wake-lock";

export type PhoneScreenModel = {
  layout: PhoneLayout;
  isFilming: boolean;
  camera: CameraStream;
  link: PhoneLink;
  menu: BannerMenuState;
  alert: ShownAlert | null;
  toast: UseToast;
  // Montrer ou cacher la caméra de ce téléphone au plan (`useCutCamera`).
  cutCamera: () => void;
  isBlack: boolean;
  onBlackout: () => void;
  onWake: () => void;
  // Filmer prend l'objectif et le cadrage de l'orientation d'alors ; arrêter de filmer rend le téléphone à la régie.
  onStartFilm: () => void;
  onStopFilm: () => void;
};

// Tout ce que l'écran du téléphone tient : s'il filme (`film`, pris à l'appui de Filmer, que la rotation ne change plus), sa disposition,
// la caméra, le flux avec le serveur, la feuille ouverte, l'alerte, le toast et l'écran noir.
export const usePhoneScreen = (initialFilm: FilmStart | null): PhoneScreenModel => {
  const isPortrait = usePortrait();
  const [film, setFilm] = useState<FilmStart | null>(initialFilm);
  const [isBlack, setIsBlack] = useState(false);
  const isFilming = film !== null;
  const layout = toPhoneLayout(isFilming, isPortrait ? "portrait" : "landscape");
  useWakeLock(isFilming);
  const camera = useCameraStream(film);
  const link = usePhoneLink(isFilming, camera.stream);
  const toast = useToast();
  const cutCamera = useCutCamera(link, toast.show);
  const menu = useBannerMenu(link.control.state.isLinked && layout !== "film-landscape");
  const alert = useAlert({
    role: toAlertRole(layout),
    view: link.control,
    film: isFilming ? { camera, link, onShow: cutCamera } : null,
    onToast: toast.show,
  });

  // Une caméra qui s'arrête, ou un téléphone qui arrête de filmer, rallume l'écran : son message (« Touche pour relancer ») a besoin d'être vu.
  useEffect(() => {
    if (!isFilming || camera.status !== "live") setIsBlack(false);
  }, [isFilming, camera.status]);

  return {
    layout,
    isFilming,
    camera,
    link,
    menu,
    alert,
    toast,
    cutCamera,
    isBlack,
    onBlackout: () => setIsBlack(true),
    onWake: () => setIsBlack(false),
    onStartFilm: () => setFilm(toFilmStart(isPortrait ? "portrait" : "landscape")),
    onStopFilm: () => {
      setFilm(null);
      menu.onCloseMenu();
    },
  };
};
