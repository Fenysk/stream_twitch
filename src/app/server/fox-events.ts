import { defineHandler } from "nitro";
import { type FoxEvent, FoxPlaceSchema } from "../../domain/fox.schema";
import { toEventStream } from "./event-stream";
import { refuse } from "./http";
import { getRuntime } from "./runtime";

// Flux SSE du renard : les règles appliquées à la connexion, puis à chaque changement ; l'adresse du WAV chaque fois qu'il
// doit parler ; le nombre de pages `/fox` connectées ; ce qu'il montre (mode), sa présence et son humeur. Une page qui se
// reconnecte ne rejoue pas la dernière phrase : seuls les règles, le nombre, le mode, la présence et l'humeur se renvoient. Une page `/fox` qui se
// connecte ne change pas sa présence : caché, il reste caché ; visible, il le reste. `?place=preview` : l'aperçu de l'onglet Renard ; sans, la page `/fox` (OBS).
// `?place=show` : la page `/show`, qui ne reçoit que les règles et sa propre voix (le serveur ne lui dit ni mode, ni présence, ni
// humeur : pendant l'émission la page décide seule de ce qu'il montre) ; les autres places reçoivent aussi si l'émission passe.
export default defineHandler((event) => {
  const place = FoxPlaceSchema.safeParse(
    new URL(event.req.url, "http://localhost").searchParams.get("place") ?? "screen",
  );
  if (!place.success) return refuse(400, "place inconnue : screen, preview ou show");
  const { fox } = getRuntime();
  return toEventStream<FoxEvent>(`du renard (${place.data})`, (send) => {
    const rules = fox.getRules();
    if (rules) send({ kind: "rules", rules });
    const unsubscribe = fox.subscribe(place.data, send);
    if (place.data === "show") return unsubscribe;
    send({ kind: "screens", count: fox.getScreens() });
    send({ kind: "show", isOn: fox.isShowOn() });
    send({ kind: "mode", mode: fox.getMode() });
    const { kind, elapsed } = fox.getPresence();
    send({ kind: "presence", presence: kind, elapsed });
    send({ kind: "attitude", attitude: fox.getAttitude() });
    return unsubscribe;
  });
});
