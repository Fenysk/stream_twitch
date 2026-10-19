import { useState } from "react";
import { toCameraName } from "../../domain/camera.rules";
import { Badge } from "../design/badge";
import { Button } from "../design/button";
import { CameraNumberPicker } from "./camera-number-picker";
import type { LinkStatus } from "./camera-sender";
import { RedDot } from "./red-dot";

const LINK_TEXTS: Record<Exclude<LinkStatus, "connected">, string> = {
  waiting: "En attente d'OBS",
  connecting: "Connexion à OBS…",
};

// Ce que dit la pastille d'état : où en est la liaison avec OBS, puis, une fois la caméra envoyée, si elle est à l'antenne
// (`air` : en rouge, avec un point) ou non (`quiet` : en sourdine).
export type StatusView = { text: string; tone: "plain" | "air" | "quiet" };

export const toStatusView = (status: LinkStatus, isOnAir: boolean): StatusView => {
  if (status !== "connected") return { text: LINK_TEXTS[status], tone: "plain" };
  return isOnAir ? { text: "À l'antenne", tone: "air" } : { text: "Hors antenne", tone: "quiet" };
};

type CameraBadgeProps = {
  number: number | null;
  status: LinkStatus;
  isOnAir: boolean;
  onUpdateNumber: (number: number) => Promise<string | null>;
  // Met ce téléphone à l'image (et son micro) : le toucher sur « Hors antenne ».
  onTakePicture: () => void;
};

// La pastille en haut à gauche : « Caméra 1 » et où en est la caméra : la liaison avec OBS, puis « À l'antenne » ou « Hors antenne ».
// Un toucher sur le nom ouvre le choix du numéro ; « Hors antenne » est un bouton, un toucher met ce téléphone à l'image.
export const CameraBadge = ({ number, status, isOnAir, onUpdateNumber, onTakePicture }: CameraBadgeProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const { text, tone } = toStatusView(status, isOnAir);
  return (
    <div className="lp-pill">
      <div className="lp-pill-content">
        <Button
          label={number === null ? "Caméra…" : toCameraName(number)}
          variant="ghost"
          isExpanded={isOpen}
          isDisabled={number === null}
          onPress={() => setIsOpen(!isOpen)}
        />
        <span className="camera-status" data-tone={tone}>
          {tone === "quiet" ? (
            <Button
              label={text}
              title="Mettre cette caméra à l'image"
              variant="ghost"
              onPress={onTakePicture}
            />
          ) : (
            <Badge label={text} icon={tone === "air" ? RedDot : undefined} />
          )}
        </span>
      </div>
      {isOpen && number !== null && (
        <CameraNumberPicker number={number} onUpdateNumber={onUpdateNumber} onDone={() => setIsOpen(false)} />
      )}
    </div>
  );
};
