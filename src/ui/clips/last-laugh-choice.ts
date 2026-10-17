// Ce que l'éditeur retient d'un clip à l'autre dans le navigateur : le dernier sound choisi pour un rire, et le dernier volume des rires.
// Jamais lu au rendu serveur ; refusé (fenêtre privée) : l'éditeur marche sans.

import { isLaughFader } from "../../domain/laugh.rules";

const SOUND_KEY = "clip-last-laugh-sound";
const FADER_KEY = "clip-last-laugh-fader";

const getStored = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.error(`Clips : « ${key} » n'a pas pu être lu`, error);
    return null;
  }
};

const updateStored = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.error(`Clips : « ${key} » n'a pas pu être retenu`, error);
  }
};

export const getLastLaughSound = (): string | null => getStored(SOUND_KEY);

export const updateLastLaughSound = (id: string): void => updateStored(SOUND_KEY, id);

// Le dernier volume des rires ; rien quand il n'y en a pas, ou que ce n'est pas un entier de 0 à 100.
export const getLastLaughFader = (): number | null => {
  const stored = getStored(FADER_KEY);
  const fader = stored === null || stored.trim() === "" ? Number.NaN : Number(stored);
  return isLaughFader(fader) ? fader : null;
};

export const updateLastLaughFader = (fader: number): void => updateStored(FADER_KEY, String(fader));
