import { createFileRoute } from "@tanstack/react-router";
import { LiveSettingsTab } from "../../ui/settings/live-settings-tab";

// L'index de /settings est la page Direct : l'accueil des réglages. Pas de route à part : chacune ajoute ~24 lignes
// répétées à routeTree.gen.ts, que le check de duplication compte (2,89 % → 3,09 % pour un seuil de 3 %, le 15/10).
export const Route = createFileRoute("/settings/")({ component: LiveSettingsTab });
