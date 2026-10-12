// Où une emote se trouve dans le texte : `start` et `end` comptent des points de code Unicode (end compris), comme Twitch.
export type EmoteRange = { id: string; start: number; end: number };

// Un message tel que la source du tchat le donne, avant qu'on le découpe et qu'on décide s'il est masqué.
export type RawMessage = {
  id: string;
  viewerId: string;
  viewerLogin: string;
  nickname: string;
  // La couleur choisie sur Twitch, ou `null` quand le viewer n'en a pas.
  color: string | null;
  text: string;
  emotes: EmoteRange[];
  isCommand: boolean;
};
