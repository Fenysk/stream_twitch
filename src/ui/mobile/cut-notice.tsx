import { toCutNotice } from "../../domain/picture.rules";
import type { PictureStanding } from "../../domain/picture.schema";

// Ce que l'aperçu d'un téléphone dit discrètement quand sa caméra n'a pas le plan : « Caméra cachée · Tête au plan ». Le téléphone
// continue d'envoyer son image ; rien n'est dit quand il a le plan, ou qu'OBS n'a pas de place caméra.
export const CutNotice = ({ standing }: { standing: PictureStanding }) => {
  const text = toCutNotice(standing);
  return text === null ? null : (
    <p className="camera-cut-notice lp-type-caption" role="status">
      {text}
    </p>
  );
};
