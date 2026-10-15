import { z } from "zod";

// Les sous-onglets de la page « Renard », dans l'ordre : `/settings/fox?section=voice`.
export const FOX_SECTION_IDS = ["voice", "body", "listening", "events", "reactions"] as const;
export type FoxSectionId = (typeof FOX_SECTION_IDS)[number];

// Un sous-onglet absent ou inconnu dans l'adresse ouvre la voix : l'adresse ne se refuse jamais.
export const FoxSearchSchema = z.object({ section: z.enum(FOX_SECTION_IDS).catch("voice") });
