import { defineHandler } from "nitro";
import { serveClipVideo } from "./clip-stream";

// La vidéo d'un clip confirmé (dans Confirmés), en flux avec `Range` : celle que la page `/show` passe.
export default defineHandler((event) => serveClipVideo("confirmed", event.req));
