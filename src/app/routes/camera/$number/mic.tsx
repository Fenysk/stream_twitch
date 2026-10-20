import { createFileRoute } from "@tanstack/react-router";
import { toCameraNumber } from "../../../../domain/camera.rules";
import { CameraMicScreen } from "../../../../ui/mobile/camera-mic-screen";
import cameraScreenCss from "../../../../ui/mobile/camera-screen.css?url";

// Source OBS qui ne porte que le son d'une caméra, sur le même hôte que sa page image (camera-<numéro>.localhost) : vide et transparente,
// elle joue la piste audio du téléphone. Une adresse qui n'est pas un numéro ne montre rien.
const CameraMicRoute = () => {
  const cameraNumber = toCameraNumber(Route.useParams().number);
  return cameraNumber === null ? null : <CameraMicScreen number={cameraNumber} />;
};

export const Route = createFileRoute("/camera/$number/mic")({
  head: () => ({
    meta: [{ title: "Mic de la caméra" }],
    links: [{ rel: "stylesheet", href: cameraScreenCss }],
  }),
  component: CameraMicRoute,
});
