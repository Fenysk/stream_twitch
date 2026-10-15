import { toVariablesIn } from "./phrase.rules";

// Les variables que peut écrire la phrase d'une récompense : le nickname du viewer qui la dépense.
export const REWARD_PHRASE_VARIABLES: readonly string[] = ["user"];

// Le nickname de « Tester » : le renard parle à Fenysk.
export const TEST_NICKNAME = "Fenysk";

// Ce qui empêcherait de dire une liste de phrases : une variable que la récompense ne donne pas, écrite une fois dans le message.
export const toPhraseIssues = (phrases: readonly string[]): string[] => {
  const unknown = new Set(
    phrases.flatMap(toVariablesIn).filter((name) => !REWARD_PHRASE_VARIABLES.includes(name)),
  );
  return [...unknown].map((name) => `la variable {${name}} n'existe pas ici : seule {user} est permise`);
};
