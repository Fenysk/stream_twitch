import type { FoxImage, FoxPlace } from "../domain/fox.schema";

// Les images du renard sont des fichiers fixes du dépôt (public/fox-images/), servis tels quels.
export const toFoxImageUrl = (image: FoxImage): string => `/fox-images/${image}.png`;

// Le flux du renard ; la page dit où elle montre le renard (l'écran d'OBS, ou l'aperçu), le serveur compte les écrans.
export const toFoxEventsUrl = (place: FoxPlace): string => `/api/fox/events?place=${place}`;
