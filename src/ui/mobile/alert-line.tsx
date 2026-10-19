import { TriangleAlert } from "lucide-react";
import type { AlertKind } from "../../domain/alert.rules";
import { Button } from "../design/button";
import { useNow } from "../settings/use-now";

// Le bouton d'une alerte : son libellé, et ce que son toucher fait.
export type AlertAction = { label: string; onPress: () => void };

// L'alerte à montrer : `text` l'écrit à l'heure donnée (la durée du muet avance), `action` est son bouton, s'il y en a un.
export type ShownAlert = { kind: AlertKind; text: (now: number) => string; action: AlertAction | null };

// La ligne orange sous le bandeau : une icône, un texte court et au plus un bouton. Une seule à l'écran, celle que `useAlert` choisit.
export const AlertLine = ({ alert }: { alert: ShownAlert }) => {
  const now = useNow(1000);
  return (
    <div className="lp-pill alert-line" role="status">
      <div className="lp-pill-content">
        <span className="alert-line-text lp-type-body lp-warning">
          <TriangleAlert aria-hidden="true" />
          <span>{alert.text(now)}</span>
        </span>
        {alert.action && <Button label={alert.action.label} onPress={alert.action.onPress} />}
      </div>
    </div>
  );
};
