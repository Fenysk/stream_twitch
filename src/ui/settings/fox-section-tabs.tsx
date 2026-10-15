// Le choix du sous-onglet du renard, en haut des réglages. Sur un écran étroit, la rangée défile d'elle-même : le sous-onglet
// choisi (par l'adresse, ou au toucher) y reste en vue, au centre quand il y a la place. Seulement de côté : la page ne bouge pas.

import { useEffect, useRef } from "react";
import type { FoxSectionId } from "../../domain/fox-section.schema";
import { Segmented } from "../design/segmented";
import { FOX_SECTION_CHOICES } from "./fox-sections";

type FoxSectionTabsProps = { sectionId: FoxSectionId; onSelect: (id: FoxSectionId) => void };

export const FoxSectionTabs = ({ sectionId, onSelect }: FoxSectionTabsProps) => {
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = row.current;
    const option = box?.querySelector(`input[value="${sectionId}"]`)?.closest("label");
    if (box && option) box.scrollLeft = option.offsetLeft - (box.clientWidth - option.offsetWidth) / 2;
  }, [sectionId]);
  return (
    <div ref={row} className="fox-sections">
      <Segmented
        label="Réglages du renard"
        options={FOX_SECTION_CHOICES}
        value={sectionId}
        onSelect={onSelect}
      />
    </div>
  );
};
