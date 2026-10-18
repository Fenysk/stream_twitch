import type { SoundSummary } from "../../domain/sound.schema";
import type { MenuChoice } from "../design/menu";

// Le menu « Son » d'une récompense : « Aucun » (valeur vide), puis les sounds par titre ; `null` : la liste n'est pas lue.
export const toSoundChoices = (sounds: readonly SoundSummary[] | null): MenuChoice[] => [
  { value: "", label: "Aucun" },
  ...(sounds ?? []).map(({ id, title }) => ({ value: id, label: title })),
];
