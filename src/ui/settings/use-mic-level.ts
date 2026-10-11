import { useEffect, useState } from "react";
import { type MicReading, MicReadingSchema } from "../../domain/mic-reading.schema";

const SILENT: MicReading = { level: -100, isLinked: false };

// Le flux du vumètre : EventSource se reconnecte seul ; tant que le serveur ne répond pas, le vumètre est vide.
export const useMicLevel = (): MicReading => {
  const [reading, setReading] = useState<MicReading>(SILENT);
  useEffect(() => {
    const source = new EventSource("/api/mic/stream");
    source.onmessage = (event: MessageEvent<string>) => {
      const parsed = MicReadingSchema.safeParse(JSON.parse(event.data));
      if (parsed.success) setReading(parsed.data);
      else console.error("Image du vumètre illisible :", parsed.error.message);
    };
    source.onerror = () => setReading(SILENT);
    return () => source.close();
  }, []);
  return reading;
};
