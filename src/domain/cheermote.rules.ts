// Un cheer porte des cheermotes (« Cheer100 », « Kappa1000 ») : un préfixe suivi du nombre de bits. Twitch ne les range pas
// parmi les emotes du message (pas de positions) : le renard les reconnaît par leur préfixe, et ne les lit pas.
const CHEERMOTE_PREFIXES = [
  "cheer",
  "biblethump",
  "cheerwhal",
  "corgo",
  "uni",
  "showlove",
  "party",
  "seemsgood",
  "pride",
  "kappa",
  "frankerz",
  "heyguys",
  "dansgame",
  "elegiggle",
  "trihard",
  "kreygasm",
  "4head",
  "swiftrage",
  "notlikethis",
  "failfish",
  "vohiyo",
  "pjsalt",
  "mrdestructoid",
  "bday",
  "ripcheer",
  "shamrock",
  "streamlabs",
  "muxy",
  "holidaycheer",
  "anon",
];

const CHEERMOTE = new RegExp(`^(?:${CHEERMOTE_PREFIXES.join("|")})\\d+$`, "iu");
const EDGES = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

// Le texte où chaque cheermote est remplacé par autant d'espaces : les positions des emotes de Twitch restent valables, le
// reste du filtre n'y voit plus que des blancs.
export const toTextWithoutCheermotes = (text: string): string =>
  text.replace(/\S+/gu, (word) =>
    CHEERMOTE.test(word.replace(EDGES, "")) ? " ".repeat(Array.from(word).length) : word,
  );
