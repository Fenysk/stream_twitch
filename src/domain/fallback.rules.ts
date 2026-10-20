import { PC_PICTURE_ID, toFallbackPictureId, toLostPictureId, toPictureMicId } from "./picture.rules";
import type { PictureState } from "./picture.schema";

// Le micro à demander quand l'image change dans OBS sans l'appli : celui que l'image décide, sauf s'il est déjà celui du live (`liveId`).
// `null` : rien à demander (la tête ne touche pas au micro).
export const toDirectMicId = (pictureId: string, liveId: string | null): string | null => {
  const wanted = toPictureMicId(pictureId);
  return wanted === liveId ? null : wanted;
};

// La caméra dont le mic est perdu est aussi à l'image perdue, et l'image se replie vers le PC : le PC à l'image prend le mic du PC avec lui,
// un repli du mic de plus serait une seconde demande pour le même micro.
export const isMicCoveredByPicture = (lostMicId: string, picture: PictureState): boolean =>
  toLostPictureId(picture) === lostMicId && toFallbackPictureId(picture) === PC_PICTURE_ID;
