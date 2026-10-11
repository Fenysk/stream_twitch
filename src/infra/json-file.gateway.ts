import { readFileSync } from "node:fs";

// Un fichier JSON du dépôt : l'erreur nomme le fichier, que le journal du serveur affiche tel quel.
export function getJsonFile(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`${path} est introuvable ou illisible`, { cause: error });
  }
  try {
    // Notepad et d'autres éditeurs Windows écrivent un BOM en tête : JSON.parse le refuse.
    return JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`${path} n'est pas du JSON valide`, { cause: error });
  }
}
