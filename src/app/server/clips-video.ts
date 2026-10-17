import { defineHandler } from "nitro";
import { serveClipVideo } from "./clip-stream";

// La vidéo d'un clip brut du dossier d'OBS, en flux avec `Range`.
export default defineHandler((event) => serveClipVideo("raw", event.req));
