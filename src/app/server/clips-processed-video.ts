import { defineHandler } from "nitro";
import { serveClipVideo } from "./clip-stream";

// La vidéo d'un clip brut rangé dans Traités, en flux avec `Range` : l'éditeur d'un clip confirmé la lit pour changer son début et sa fin.
export default defineHandler((event) => serveClipVideo("processed", event.req));
