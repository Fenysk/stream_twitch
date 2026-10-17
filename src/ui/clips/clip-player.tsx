// Le lecteur d'un clip brut : une vidéo HTML dont le serveur sert le fichier en flux, pour se déplacer dedans. `videoRef` donne la
// vidéo à l'éditeur, qui la pilote (raccourcis, lecture de la partie gardée).

import type { Ref } from "react";
import { toClipVideoUrl } from "../clips-api";

// `src` : l'adresse de la vidéo ; sans elle, celle du clip brut `name` dans le dossier d'OBS.
type ClipPlayerProps = { name: string; src?: string; videoRef?: Ref<HTMLVideoElement> };

export const ClipPlayer = ({ name, src, videoRef }: ClipPlayerProps) => (
  <video
    ref={videoRef}
    key={name}
    className="clip-video"
    src={src ?? toClipVideoUrl(name)}
    controls
    preload="metadata"
    aria-label={`Lecteur : ${name}`}
  >
    {/* Un clip d'OBS n'a pas de sous-titres. */}
    <track kind="captions" />
  </video>
);
