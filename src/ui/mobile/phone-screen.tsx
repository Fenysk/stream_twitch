import type { FilmStart, PhoneLayout } from "../../domain/phone-layout.rules";
import { toStopFilmText } from "../../domain/picture.rules";
import { BlackScreen } from "./black-screen";
import { CameraSheet, StopFilmSheet } from "./camera-sheet";
import { ControlToast } from "./control-toast";
import { LandscapeBody, StackBody } from "./phone-bodies";
import { type PhoneScreenModel, usePhoneScreen } from "./use-phone-screen";

// Les classes de la page de chaque disposition : la grille du haut au bas (`control-role`, avec l'aperçu en plus en portrait quand il filme) ou
// l'aperçu plein écran (`camera-role`).
const ROOT_CLASSES: Record<PhoneLayout, string> = {
  plain: "control-role",
  "film-portrait": "control-role selfie-role",
  "film-landscape": "camera-role",
};

// Les feuilles d'un téléphone qui filme : la feuille Caméra, et la confirmation d'« Arrêter de filmer » qui la remplace quand l'arrêt change
// l'antenne. Posées après tout ce qu'elles recouvrent.
const FilmSheets = ({
  link,
  menu,
  onStopFilm,
}: Pick<PhoneScreenModel, "link" | "menu"> & { onStopFilm: () => void }) => (
  <>
    <CameraSheet
      number={link.number}
      isOpen={menu.openMenu === "camera"}
      standing={link.standing}
      isLiveMic={link.isLiveMic}
      onClose={menu.onCloseMenu}
      onUpdateNumber={link.updateNumber}
      onAskStop={() => menu.onOpenMenu("unfilm")}
      onStopFilming={onStopFilm}
    />
    <StopFilmSheet
      isOpen={menu.openMenu === "unfilm"}
      outcome={toStopFilmText(link.standing, link.isLiveMic)}
      onClose={menu.onCloseMenu}
      onStopFilming={onStopFilm}
    />
  </>
);

type PhoneScreenProps = {
  // Ce que le téléphone fait à l'ouverture : filmer (l'objectif et le cadrage d'un `?role=`) ou non (`null`). Filmer se décide ensuite par
  // le bouton.
  initialFilm: FilmStart | null;
  onUpdateRole: () => void;
};

// L'écran du téléphone : le même, qu'il filme ou non, sur un seul flux avec le serveur (état de la régie, et caméra quand il filme).
// Filmer prend l'objectif et le cadrage de l'orientation d'alors, puis la rotation ne change plus que la disposition (`toPhoneLayout`) :
// - ne filme pas : le haut (la vignette de l'antenne et sa légende, le coin), l'alerte, le chat, la barre du bas [Micro : X] [Filmer] [Sons],
//   la même en portrait et en paysage ;
// - filme en portrait : l'aperçu en haut (cadre rouge à l'antenne, pastille « Caméra N · Prête », l'objectif), puis le même haut, l'alerte, le
//   chat et la barre [Micro : X] [Montrer ou Cacher] [Sons] ;
// - filme en paysage : l'aperçu plein écran, la pastille, l'alerte en haut, et la barre [Micro : X] [Montrer ou Cacher] [Objectif] [Écran noir].
// Les feuilles (Antenne, Live, Micro, Caméra) s'ouvrent par-dessus tout, une à la fois.
export const PhoneScreen = ({ initialFilm, onUpdateRole }: PhoneScreenProps) => {
  const model = usePhoneScreen(initialFilm);
  const { layout, isFilming, link, menu, toast } = model;
  const isLandscape = layout === "film-landscape";
  const Body = isLandscape ? LandscapeBody : StackBody;
  return (
    <main className={ROOT_CLASSES[layout]} data-on-air={isLandscape ? link.isOnAir : undefined}>
      <Body model={model} onUpdateRole={onUpdateRole} />
      {isFilming && <FilmSheets link={link} menu={menu} onStopFilm={model.onStopFilm} />}
      <ControlToast message={toast.message} />
      {model.isBlack && <BlackScreen isOnAir={link.isOnAir} onWake={model.onWake} />}
    </main>
  );
};
