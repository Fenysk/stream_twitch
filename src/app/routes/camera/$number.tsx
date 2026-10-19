import { createFileRoute } from "@tanstack/react-router";
import { toCameraNumber } from "../../../domain/camera.rules";
import { CameraScreen } from "../../../ui/mobile/camera-screen";
import cameraScreenCss from "../../../ui/mobile/camera-screen.css?url";

// Source OBS d'une caméra, servie sur son hôte (camera-<numéro>.localhost) : une adresse qui n'est pas un numéro ne montre rien. Le
// fichier est dans un dossier parce que le nom `camera.$number.tsx` est refusé par la règle de nommage des fichiers.
const CameraRoute = () => {
  const cameraNumber = toCameraNumber(Route.useParams().number);
  return cameraNumber === null ? null : <CameraScreen number={cameraNumber} />;
};

export const Route = createFileRoute("/camera/$number")({
  head: () => ({
    meta: [{ title: "Caméra" }],
    links: [{ rel: "stylesheet", href: cameraScreenCss }],
  }),
  component: CameraRoute,
});
