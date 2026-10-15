import { useEffect } from "react";
import { SoundEventSchema } from "../domain/sound.schema";
import { createAudioPlayer } from "./sound-audio";
import { createSoundScreen } from "./sound-screen";
import { SOUND_EVENTS_URL } from "./sound-urls";
import { reportSound } from "./sounds-api";

// Fait vivre la page /sounds : les sons arrivent du flux du serveur, se jouent l'un après l'autre, et chaque fin est
// répondue au serveur (c'est ce qui rendra les points d'un son raté). Rien à afficher : la source OBS est transparente.
export const useSoundScreen = (): void => {
  useEffect(() => {
    const screen = createSoundScreen({ player: createAudioPlayer(), report: reportSound });
    const source = new EventSource(SOUND_EVENTS_URL);
    source.onmessage = (message: MessageEvent<string>) => {
      const parsed = SoundEventSchema.safeParse(JSON.parse(message.data));
      if (parsed.success) screen.handle(parsed.data);
      else console.error("Message du serveur illisible :", parsed.error.message);
    };
    return () => {
      source.close();
      screen.close();
    };
  }, []);
};
