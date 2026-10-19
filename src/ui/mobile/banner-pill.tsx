import { Button, type ButtonIcon } from "../design/button";

type BannerPillProps = {
  icon: ButtonIcon;
  label: string;
  // Le nom du bouton quand son libellé ne dit pas ce qu'il fait (« Jeu » ouvre le choix de la scène).
  title: string;
  // La feuille que ce bouton ouvre l'est (aria-expanded).
  isExpanded: boolean;
  // Le libellé change (la durée du live à chaque seconde) : la largeur glisse et les chiffres gardent leur largeur.
  hasMorphingLabel?: boolean;
  onPress: () => void;
};

// Une pastille du bandeau qui est un bouton : une icône et son libellé, de la hauteur tactile du bouton. Le nom se coupe par des points
// quand la place manque (control-role.css).
export const BannerPill = ({
  icon,
  label,
  title,
  isExpanded,
  hasMorphingLabel = false,
  onPress,
}: BannerPillProps) => (
  <div className="lp-pill control-menu-pill">
    <div className="lp-pill-content control-menu-content">
      <Button
        icon={icon}
        label={label}
        title={title}
        variant="ghost"
        isExpanded={isExpanded}
        hasMorphingLabel={hasMorphingLabel}
        onPress={onPress}
      />
    </div>
  </div>
);
