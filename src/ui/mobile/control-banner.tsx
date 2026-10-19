import { Clapperboard, Eye, Video } from "lucide-react";
import type { ReactNode } from "react";
import { classNames } from "../design/class-names";
import { useNow } from "../settings/use-now";
import type { BannerMenu } from "./banner-menus";
import { BannerPill } from "./banner-pill";
import { hasPicture, toLiveText, toPictureText, toSceneText, toViewersText } from "./control-view";
import { RedDot } from "./red-dot";
import type { ControlView } from "./use-control-state";

// `openMenu` : la feuille que le bandeau a ouverte, s'il en a une (le bouton de sa pastille le dit) ; `onOpenMenu` ouvre celle d'une
// pastille. `children` : ce qui finit le bandeau, à droite des pastilles (le coin qui change de rôle sur la Régie, rien sous l'aperçu du
// Selfie). `lead` : ce qui ouvre le bandeau, avant les pastilles (la vignette de l'antenne, à la Régie comme au Selfie).
type ControlBannerProps = {
  view: ControlView;
  openMenu: BannerMenu | null;
  onOpenMenu: (menu: BannerMenu) => void;
  lead?: ReactNode;
  children?: ReactNode;
};

// Le bandeau du haut, en pastilles : la durée du live (un point rouge et « Live 1:42 » pendant la diffusion d'OBS, un bouton qui ouvre la
// confirmation de l'arrêt du live ; « Hors ligne » sinon, sans bouton : l'appli ne démarre pas le live), le nombre de viewers, la scène à
// l'antenne et, quand OBS a une place caméra, le plan, ces trois-là des boutons qui ouvrent la liste des viewers, le menu des scènes et le
// menu du plan. Le micro n'y est pas : il est dans la barre du bas. La durée avance chaque seconde depuis le dernier état reçu, sauf quand
// l'état est périmé (`view.staleAt`) : elle reste celle de l'instant où il l'est devenu, et le bandeau est grisé.
export const ControlBanner = ({ view, openMenu, onOpenMenu, lead, children }: ControlBannerProps) => {
  const now = useNow(1000);
  const { state, receivedAt, staleAt } = view;
  const isStale = typeof staleAt === "number";
  const elapsedMs = (isStale ? staleAt : now) - receivedAt;
  const viewers = toViewersText(state.viewers);
  return (
    <header className={classNames("control-banner", isStale && "control-banner-stale")}>
      {lead}
      {state.broadcast.isLive ? (
        <BannerPill
          icon={RedDot}
          label={toLiveText(state, elapsedMs)}
          title="Arrêter le live"
          isExpanded={openMenu === "stop"}
          hasMorphingLabel
          onPress={() => onOpenMenu("stop")}
        />
      ) : (
        <div className="lp-pill">
          <div className="lp-pill-content">
            <span className="lp-type-numeric">{toLiveText(state, elapsedMs)}</span>
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
      {hasPicture(state) && (
        <BannerPill
          icon={Video}
          label={toPictureText(state)}
          title="Choisir le plan"
          isExpanded={openMenu === "picture"}
          onPress={() => onOpenMenu("picture")}
        />
      )}
      {children}
    </header>
  );
};
