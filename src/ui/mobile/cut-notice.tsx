import { toCutNotice } from "../../domain/picture.rules";
import type { PictureStanding } from "../../domain/picture.schema";

// Ce que l'aperçu d'un téléphone dit discrètement quand sa caméra n'est pas à l'image : « Caméra coupée · Tête à l'image ». Le téléphone
// continue d'envoyer son image ; rien n'est dit quand il est à l'image, ou qu'OBS n'a pas de place caméra.
export const CutNotice = ({ standing }: { standing: PictureStanding }) => {
  const text = toCutNotice(standing);
  return text === null ? null : (
    <p className="camera-cut-notice lp-type-caption" role="status">
      {text}
    </p>
  );
};
