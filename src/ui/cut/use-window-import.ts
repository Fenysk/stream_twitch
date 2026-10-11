// Glisser une image sur la page, ou en coller une : comme le bouton « Importer ». Un texte collé (le nom, par exemple)
// n'est pas pris : seul un fichier déclenche l'import.

import { useEffect } from "react";

export const useWindowImport = (openFile: (file: File) => Promise<void>): void => {
  useEffect(() => {
    const onDragOver = (event: DragEvent) => event.preventDefault();
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      const file = event.dataTransfer?.files[0];
      if (file) void openFile(file);
    };
    const onPaste = (event: ClipboardEvent) => {
      const file = event.clipboardData?.files[0];
      if (!file) return;
      event.preventDefault();
      void openFile(file);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("paste", onPaste);
    };
  }, [openFile]);
};
