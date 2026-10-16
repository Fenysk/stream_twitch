// L'heure du PC (ms), relue toutes les `periodMs` ms tant que le composant est affiché : ce qui en dépend se redessine tout seul.

import { useEffect, useState } from "react";

export const useNow = (periodMs: number): number => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), periodMs);
    return () => clearInterval(timer);
  }, [periodMs]);

  return now;
};
