import { Clapperboard, Eye, Mic, MicOff, Video } from "lucide-react";
import type { ReactNode } from "react";
import { toLiveMic } from "../../domain/control.rules";
import { useNow } from "../settings/use-now";
import type { BannerMenu } from "./banner-menus";
import { BannerPill } from "./banner-pill";
import { hasPicture, toLiveText, toMicText, toPictureText, toSceneText, toViewersText } from "./control-view";
import { RedDot } from "./red-dot";
import type { ControlView } from "./use-control-state";

// `openMenu` : la feuille que le bandeau a ouverte, s'il en a une (le bouton de sa pastille le dit) ; `onOpenMenu` ouvre celle d'une
// pastille. `children` : ce qui finit le bandeau, à droite des pastilles (le coin qui change de rôle sur la Régie, rien sous l'aperçu du
// Selfie). `lead` : ce qui ouvre le bandeau, avant les pastilles (la vignette du retour antenne sur la Régie, rien sous l'aperçu du Selfie).
type ControlBannerProps = {
  view: ControlView;
  openMenu: BannerMenu | null;
  onOpenMenu: (menu: BannerMenu) => void;
  lead?: ReactNode;
  children?: ReactNode;
};

// Le bandeau du haut, en pastilles : la durée du live (un point rouge et « Live 1:42 » pendant la diffusion d'OBS, un bouton qui ouvre la
// confirmation de l'arrêt du live ; « Hors ligne » sinon, sans bouton : l'appli ne démarre pas le live), le nombre de viewers, la scène à
// l'antenne, le micro du live et, quand OBS a une place caméra, qui est à l'image, ces quatre-là des boutons qui ouvrent la liste des viewers,
// le menu des scènes, celui des micros et celui de l'image. La durée avance chaque seconde depuis le dernier état reçu.
export const ControlBanner = ({ view, openMenu, onOpenMenu, lead, children }: ControlBannerProps) => {
  const now = useNow(1000);
  const { state, receivedAt } = view;
  const viewers = toViewersText(state.viewers);
  return (
    <header className="control-banner">
      {lead}
      {state.broadcast.isLive ? (
        <BannerPill
          icon={RedDot}
          label={toLiveText(state, now - receivedAt)}
          title="Arrêter le live"
          isExpanded={openMenu === "stop"}
          hasMorphingLabel
          onPress={() => onOpenMenu("stop")}
        />
      ) : (
        <div className="lp-pill">
          <div className="lp-pill-content">
            <span className="lp-type-numeric">{toLiveText(state, now - receivedAt)}</span>
          </div>
        </div>
      )}
      <BannerPill
        icon={Eye}
        label={viewers.text}
        title={`${viewers.title} : voir qui est dans le tchat`}
        isExpanded={openMenu === "viewers"}
        onPress={() => onOpenMenu("viewers")}
      />
      <BannerPill
        icon={Clapperboard}
        label={toSceneText(state)}
        title="Choisir la scène à l'antenne"
        isExpanded={openMenu === "scenes"}
        onPress={() => onOpenMenu("scenes")}
      />
      <BannerPill
        icon={toLiveMic(state.mics) === null ? MicOff : Mic}
        label={toMicText(state)}
        title="Choisir le micro du live"
        isExpanded={openMenu === "mics"}
        onPress={() => onOpenMenu("mics")}
      />
      {hasPicture(state) && (
        <BannerPill
          icon={Video}
          label={toPictureText(state)}
          title="Choisir qui est à l'image"
          isExpanded={openMenu === "picture"}
          onPress={() => onOpenMenu("picture")}
        />
      )}
      {children}
    </header>
  );
};
