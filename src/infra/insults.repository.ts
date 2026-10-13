import { readFileSync } from "node:fs";
import { type InsultList, toInsultList } from "../domain/chat-insults.rules";

// La liste d'insultes du dépôt (moderation/insults.fr.txt). Elle est versionnée et le renard ne peut pas lire le tchat sans
// elle : un fichier absent ou sans entrée arrête le démarrage, avec son chemin dans le message.
export function getInsults(path: string): InsultList {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`${path} est introuvable ou illisible`, { cause: error });
  }
  const list = toInsultList(text);
  if (list.parts.length + list.words.size === 0) throw new Error(`${path} ne contient aucune insulte`);
  return list;
}
