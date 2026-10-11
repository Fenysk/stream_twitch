// Les phrases du design system : celles que ses composants écrivent eux-mêmes, et les mots que la fenêtre se partage
// (Fermer, Chargement…). L'interface est en français seulement : un objet, sans choix de langue.

export const DESIGN_TEXTS = {
  cancel: "Annuler",
  close: "Fermer",
  closeTip: "Fermer (Échap)",
  escapeKey: "Échap",
  loading: "Chargement…",
  sections: "Sections",

  appearance: "Apparence",
  appearanceAuto: "Auto",
  appearanceLight: "Clair",
  appearanceDark: "Sombre",
  appearanceTip: (choice: string) => `Apparence : ${choice}`,
};
