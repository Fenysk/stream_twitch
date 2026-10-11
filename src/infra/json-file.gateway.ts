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
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} n'est pas du JSON valide`, { cause: error });
  }
}
