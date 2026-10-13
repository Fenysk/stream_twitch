export type ContactKind = "link" | "email" | "phone";

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/u;
const SPOKEN_EMAIL = /\barobase\b/iu;
const SCHEME = /(?:https?|ftp):\/\//i;
const WWW = /\bwww\./i;

// Les extensions qu'on voit dans un lien de tchat. Pas les plus courtes (.ca, .be, .de, .me…) : « ok.ca va », une phrase
// sans espace après le point, ne doit pas passer pour un lien.
const EXTENSIONS =
  "com|net|org|fr|tv|gg|io|ly|xyz|info|biz|link|live|shop|online|site|app|dev|gl|tk|ru|cc|ws|vip|club|store|tech|fun|top|pro|gd|cx|su|pw|ml|ga|cf|gq|co|eu|uk";
// « site.com », mais aussi « site . com », « site[.]com », « site (dot) com » et « site dot com ».
const DOMAIN = new RegExp(
  `(?<![\\p{L}\\p{N}-])[\\p{L}\\p{N}][\\p{L}\\p{N}-]*(?:\\s*(?:\\.|\\[\\.\\]|\\(\\.\\)|\\[dot\\]|\\(dot\\))\\s*|\\s+dot\\s+)(?:${EXTENSIONS})(?![\\p{L}\\p{N}])`,
  "iu",
);

// Neuf chiffres ou plus, séparés au plus par deux signes (espace, point, tiret, parenthèse) : « 06 12 34 56 78 », « +1 (555) 123-4567 ».
const PHONE = /\d(?:[\s.\-()]{0,2}\d){8,}/;

// Un lien, une adresse mail ou un numéro de téléphone : le renard ne les dit pas.
export function toContactKind(text: string): ContactKind | null {
  if (EMAIL.test(text) || SPOKEN_EMAIL.test(text)) return "email";
  if (SCHEME.test(text) || WWW.test(text) || DOMAIN.test(text)) return "link";
  if (PHONE.test(text)) return "phone";
  return null;
}
