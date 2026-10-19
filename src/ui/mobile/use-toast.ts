import { useCallback, useEffect, useRef, useState } from "react";
import type { ToastMessage, ToastTone } from "../design/toast-announcement";

// Un toast reste 4 s : le temps de le lire sans qu'il couvre longtemps la page.
export const TOAST_MS = 4000;

export type UseToast = {
  message: ToastMessage | null;
  show: (tone: ToastTone, text: string) => void;
};

// Le toast de la régie : le dernier message, qui part tout seul. Deux fois la même phrase font deux toasts (l'`id` change).
export const useToast = (): UseToast => {
  const [message, setMessage] = useState<ToastMessage | null>(null);
  const count = useRef(0);

  const show = useCallback((tone: ToastTone, text: string) => {
    count.current += 1;
    setMessage({ id: count.current, tone, text });
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [message]);

  return { message, show };
};
