import { hasCamera } from "./camera.rules";
import type { PhoneRole } from "./phone.schema";

// Comment le téléphone est tenu, et quel objectif de caméra : la rotation ne change que la disposition de l'écran, jamais l'objectif ni le
// cadrage que Filmer a pris à l'appui.
export type Orientation = "portrait" | "landscape";
export type Facing = "environment" | "user";

// Ce que Filmer demande à la caméra : l'objectif, et le cadrage de l'image (9:16 en portrait, 16:9 en paysage), pris une fois à l'appui.
export type FilmStart = { facing: Facing; framing: Orientation };

// Les dispositions de l'écran : `plain` quand le téléphone ne filme pas (la même en portrait et en paysage), `film-portrait` (l'aperçu en
// haut, le chat dessous) et `film-landscape` (l'aperçu plein écran) quand il filme.
export type PhoneLayout = "plain" | "film-portrait" | "film-landscape";

export const toPhoneLayout = (isFilming: boolean, orientation: Orientation): PhoneLayout => {
  if (!isFilming) return "plain";
  return orientation === "portrait" ? "film-portrait" : "film-landscape";
};

// Filmer en portrait prend l'objectif avant (le téléphone se filme) en 9:16 ; en paysage, l'arrière (il filme devant lui) en 16:9.
export const toFilmStart = (orientation: Orientation): FilmStart =>
  orientation === "portrait"
    ? { facing: "user", framing: "portrait" }
    : { facing: "environment", framing: "landscape" };

// L'état de départ qu'un `?role=` demande (les QR codes déjà imprimés) : camera filme avec l'arrière en 16:9, selfie avec l'avant en 9:16,
// control ne filme pas.
export const toRoleFilmStart = (role: PhoneRole): FilmStart | null => {
  if (!hasCamera(role)) return null;
  return role === "selfie" ? toFilmStart("portrait") : toFilmStart("landscape");
};

// L'ensemble d'alertes de chaque disposition : ceux de R2, que `alert.rules.ts` nomme encore par rôle (R5 les renomme).
export const toAlertRole = (layout: PhoneLayout): PhoneRole => {
  if (layout === "plain") return "control";
  return layout === "film-portrait" ? "selfie" : "camera";
};
