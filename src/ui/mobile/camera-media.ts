// Ce que le téléphone demande à sa caméra, à son mic et à l'encodeur : 1080p en 16:9 (à la verticale en 9:16 pour le Selfie) si le
// téléphone le sait faire, l'image à 6 Mb/s au plus (le WiFi de la maison), H.264 devant (l'encodeur de l'iPhone est dans la puce).

import type { Facing, Orientation } from "../../domain/phone-layout.rules";

// Comment l'image est cadrée : en largeur (16:9, téléphone filmé à l'horizontale) ou en hauteur (9:16, jamais recadré), pris à l'appui de
// Filmer.
const IMAGE_SIZES: Record<Orientation, { width: number; height: number }> = {
  landscape: { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
};

export const VIDEO_MAX_BITRATE = 6_000_000;

export const toOtherFacing = (facing: Facing): Facing => (facing === "environment" ? "user" : "environment");

export const toVideoConstraints = (facing: Facing, orientation: Orientation): MediaTrackConstraints => {
  const { width, height } = IMAGE_SIZES[orientation];
  return {
    facingMode: { ideal: facing },
    width: { ideal: width },
    height: { ideal: height },
    aspectRatio: { ideal: width / height },
    frameRate: { ideal: 30 },
  };
};

// L'aperçu de la caméra avant se voit en miroir, comme dans un miroir ; l'image envoyée à OBS ne l'est jamais.
export const isPreviewMirrored = (facing: Facing): boolean => facing === "user";

// Le son du mic avec le traitement vocal d'iOS, comme FaceTime : annulation d'écho, réduction de bruit et gain automatique. Le mic brut
// arrivait vers -45 à -50 dB à distance de parole, trop bas pour OBS ; c'est ce traitement qui remonte et nettoie la voix sur iPhone. Le boost
// du serveur (boost.rules.ts) complète ce qui manque encore.
export const toCameraConstraints = (facing: Facing, orientation: Orientation): MediaStreamConstraints => ({
  video: toVideoConstraints(facing, orientation),
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
});

// H.264 d'abord, puis le reste dans l'ordre du navigateur (le navigateur de la page OBS prend le premier qu'il comprend aussi).
export const toPreferredCodecs = <Codec extends { mimeType: string }>(codecs: readonly Codec[]): Codec[] => {
  const isH264 = ({ mimeType }: Codec): boolean => mimeType.toLowerCase() === "video/h264";
  return [...codecs.filter(isH264), ...codecs.filter((codec) => !isH264(codec))];
};

export type CameraFailure = "denied" | "unavailable";

// Pourquoi la caméra n'a pas démarré, d'après le nom de l'erreur : refusée par l'utilisateur ou le navigateur, ou introuvable ou prise.
export const toCameraFailure = (errorName: string): CameraFailure =>
  errorName === "NotAllowedError" || errorName === "SecurityError" ? "denied" : "unavailable";
