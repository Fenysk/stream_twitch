import { defineHandler } from "nitro";
import type { ShowState } from "../../domain/show.schema";
import { toEventStream } from "./event-stream";
import { getRuntime } from "./runtime";

// Flux SSE de l'émission : son état à la connexion (arrêtée, en cours avec ses clips, finie), puis à chaque changement. Une page
// `/show` se connecte avec `?place=page` : le serveur la compte, une émission sans page connectée s'arrête au bout de 20 s. L'onglet
// Émission se connecte sans.
export default defineHandler((event) => {
  const isPage = new URL(event.req.url, "http://localhost").searchParams.get("place") === "page";
  const { director } = getRuntime();
  return toEventStream<ShowState>(
    isPage ? "de l'émission (page /show)" : "de l'émission (onglet)",
    (send) => {
      const closePage = isPage ? director.openPage() : () => undefined;
      send(director.getState());
      const unsubscribe = director.subscribe(send);
      return () => {
        unsubscribe();
        closePage();
      };
    },
  );
});
