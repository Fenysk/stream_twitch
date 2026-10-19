import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../design/button";

const COPIED_MS = 2000;

// « Copier » : met le texte dans le presse-papiers, puis dit « Copié » pendant 2 s. Le navigateur peut refuser (page sans HTTPS ni
// localhost) : la console le dit, le bouton ne change pas.
export const CopyButton = ({ text, title }: { text: string; title: string }) => {
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (!isCopied) return;
    const timer = setTimeout(() => setIsCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [isCopied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
    } catch (error) {
      console.warn("Mobile : le navigateur refuse la copie", error);
    }
  };

  return (
    <Button
      label={isCopied ? "Copié" : "Copier"}
      title={title}
      icon={isCopied ? Check : Copy}
      onPress={() => void copy()}
    />
  );
};
