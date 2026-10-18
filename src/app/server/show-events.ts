import { defineHandler } from "nitro";
import type { HeadView } from "../../domain/head.types";
import type { ShowState } from "../../domain/show.schema";
import { toEventStream } from "./event-stream";
import { getRuntime } from "./runtime";
import { openShowStream } from "./show-stream";

// Flux SSE de l'émission : son état à la connexion (arrêtée, en cours avec ses clips, finie), puis à chaque changement. Une page
// `/show` se connecte avec `?place=page` : le serveur la compte, une émission sans page connectée s'arrête au bout de 20 s, et elle
// reçoit en plus la vue de la tête de Fenysk (évènement `head`). L'onglet Émission se connecte sans.
export default defineHandler((event) => {
  const isPage = new URL(event.req.url, "http://localhost").searchParams.get("place") === "page";
  const { director, feed } = getRuntime();
  return toEventStream<ShowState, HeadView>(
    isPage ? "de l'émission (page /show)" : "de l'émission (onglet)",
    (send, sendNamed) => openShowStream({ director, feed }, isPage, send, sendNamed),
  );
});
