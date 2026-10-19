import { ArrowLeftRight } from "lucide-react";
import { Button } from "../design/button";

// Le bouton discret d'un coin de chaque écran de rôle : il revient au choix du rôle.
export const RoleCorner = ({ onPress }: { onPress: () => void }) => (
  <div className="lp-pill role-corner">
    <div className="lp-pill-content">
      <Button icon={ArrowLeftRight} title="Changer de rôle" variant="ghost" onPress={onPress} />
    </div>
  </div>
);
