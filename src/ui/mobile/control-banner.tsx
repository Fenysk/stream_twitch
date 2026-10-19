import type { ReactNode } from "react";
import { Button } from "../design/button";
import { classNames } from "../design/class-names";
import { useNow } from "../settings/use-now";
import type { BannerMenu } from "./banner-menus";
import { type ControlView, toAntennaText, toLiveLineText } from "./control-view";
import { RedDot } from "./red-dot";

// `openMenu` : la feuille que le bandeau a ouverte, s'il en a une (le bouton de sa ligne le dit) ; `onOpenMenu` ouvre celle d'une ligne.
// `children` : ce qui finit le bandeau, à droite de la légende (le coin qui change de rôle sur la Régie, rien sous l'aperçu du Selfie).
// `lead` : ce qui ouvre le bandeau, avant la légende (la vignette de l'antenne, à la Régie comme au Selfie).
type ControlBannerProps = {
  view: ControlView;
  openMenu: BannerMenu | null;
  onOpenMenu: (menu: BannerMenu) => void;
  lead?: ReactNode;
  children?: ReactNode;
};

// Le bandeau du haut : la vignette de l'antenne et, à côté, une légende de deux lignes qui sont deux boutons. Ligne 1 « Jeu · PC » (la scène,
// puis le plan quand OBS a une place caméra) : comme la vignette, elle ouvre la feuille Antenne. Ligne 2 « ● Live 1:42 · 12 » (le point rouge,
// la durée et les viewers pendant la diffusion d'OBS ; « Hors ligne » sinon) : elle ouvre la feuille Live. Le micro n'y est pas : il est dans
// la barre du bas. La durée avance chaque seconde depuis le dernier état reçu, sauf quand l'état est périmé (`view.staleAt`) : elle reste
// celle de l'instant où il l'est devenu, et le bandeau est grisé.
export const ControlBanner = ({ view, openMenu, onOpenMenu, lead, children }: ControlBannerProps) => {
  const now = useNow(1000);
  const { state, receivedAt, staleAt } = view;
  const isStale = typeof staleAt === "number";
  const elapsedMs = (isStale ? staleAt : now) - receivedAt;
  return (
    <header className={classNames("control-banner", isStale && "control-banner-stale")}>
      {lead}
      <div className="banner-legend">
        <Button
          label={toAntennaText(state)}
          title="Antenne : choisir la scène et le plan"
          isExpanded={openMenu === "monitor"}
          onPress={() => onOpenMenu("monitor")}
        />
        <Button
          {...(state.broadcast.isLive ? { icon: RedDot } : {})}
          label={toLiveLineText(state, elapsedMs)}
          title="Live : fin prévue, bilan, viewers"
          isExpanded={openMenu === "live"}
          onPress={() => onOpenMenu("live")}
        />
      </div>
      {children}
    </header>
  );
};
