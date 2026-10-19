import { toCameraName } from "../../domain/camera.rules";
import { Badge } from "../design/badge";
import { Button } from "../design/button";
import type { LinkStatus } from "./camera-sender";
import { RedDot } from "./red-dot";

const LINK_TEXTS: Record<Exclude<LinkStatus, "connected">, string> = {
  waiting: "En attente d'OBS",
  connecting: "Connexion à OBS…",
};

// Ce que dit la pastille d'état : où en est la liaison avec OBS, puis, une fois la caméra envoyée, si elle est à l'antenne
// (`air` : en rouge, avec un point) ou prête, OBS la reçoit sans qu'elle soit à l'antenne (`quiet` : en sourdine).
export type StatusView = { text: string; tone: "plain" | "air" | "quiet" };

export const toStatusView = (status: LinkStatus, isOnAir: boolean): StatusView => {
  if (status !== "connected") return { text: LINK_TEXTS[status], tone: "plain" };
  return isOnAir ? { text: "À l'antenne", tone: "air" } : { text: "Prête", tone: "quiet" };
};

type CameraBadgeProps = {
  number: number | null;
  status: LinkStatus;
  isOnAir: boolean;
  // La feuille Caméra est ouverte.
  isOpen: boolean;
  onPress: () => void;
};

// La pastille en haut à gauche de l'aperçu : « Caméra 1 » et où en est la caméra : la liaison avec OBS, puis « À l'antenne » ou « Prête ». Un
// toucher sur le nom ouvre la feuille Caméra (le numéro, arrêter de filmer) ; l'état n'est qu'un statut : se montrer passe par « Montrer ».
export const CameraBadge = ({ number, status, isOnAir, isOpen, onPress }: CameraBadgeProps) => {
  const { text, tone } = toStatusView(status, isOnAir);
  return (
    <div className="lp-pill">
      <div className="lp-pill-content">
        <Button
          label={number === null ? "Caméra…" : toCameraName(number)}
          title="Caméra : numéro, arrêter de filmer"
          variant="ghost"
          isExpanded={isOpen}
          isDisabled={number === null}
          onPress={onPress}
        />
        <span className="camera-status" data-tone={tone}>
          <Badge label={text} icon={tone === "air" ? RedDot : undefined} />
        </span>
      </div>
    </div>
  );
};
