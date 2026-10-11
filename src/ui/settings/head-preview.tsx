// L'aperçu en direct de l'onglet « Tête South Park » : le même composant Head que la page `/head`, nourri par le même flux
// (le serveur envoie l'expression, la pose et les réglages appliqués), sur un damier. Il réagit donc à chaque curseur et
// à chaque vignette, et il parle quand Alexis parle.

import { Head } from "../Head";
import { useHeadView } from "../use-head-view";

export const HeadPreview = () => {
  const shown = useHeadView();
  return (
    <div className="head-preview-stage settings-checker" role="img" aria-label="Aperçu de la tête">
      {shown && <Head images={shown.images} view={shown.view} layout="box" />}
    </div>
  );
};
