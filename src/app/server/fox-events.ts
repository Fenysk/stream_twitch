import { defineHandler } from "nitro";
import { type FoxEvent, FoxPlaceSchema } from "../../domain/fox.schema";
import { toEventStream } from "./event-stream";
import { refuse } from "./http";
import { getRuntime } from "./runtime";

// Flux SSE du renard : les règles appliquées à la connexion, puis à chaque changement ; l'adresse du WAV chaque fois qu'il
// doit parler ; le nombre de pages `/fox` connectées ; ce qu'il montre (mode), sa présence et son humeur. Une page qui se
// reconnecte ne rejoue pas la dernière phrase : seuls les règles, le nombre, le mode, la présence et l'humeur se renvoient. Une page `/fox` qui se
// connecte le trouve visible, et les 3 min avant son départ repartent. `?place=preview` : l'aperçu de l'onglet Renard ; sans, la page `/fox` (OBS).
export default defineHandler((event) => {
  const place = FoxPlaceSchema.safeParse(
    new URL(event.req.url, "http://localhost").searchParams.get("place") ?? "screen",
  );
  if (!place.success) return refuse(400, "place inconnue : screen ou preview");
  const { fox, mode } = getRuntime();
  return toEventStream<FoxEvent>(`du renard (${place.data})`, (send) => {
    const rules = fox.getRules();
    if (rules) send({ kind: "rules", rules });
    if (place.data === "screen") mode.reset();
    const unsubscribe = fox.subscribe(place.data, send);
    send({ kind: "screens", count: fox.getScreens() });
    send({ kind: "mode", mode: fox.getMode() });
    const { kind, elapsed } = fox.getPresence();
    send({ kind: "presence", presence: kind, elapsed });
    send({ kind: "attitude", attitude: fox.getAttitude() });
    return unsubscribe;
  });
});
