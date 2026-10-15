import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { FoxSearchSchema } from "../../domain/fox-section.schema";
import { FoxSettingsTab } from "../../ui/settings/fox-settings-tab";

// Le sous-onglet est dans l'adresse (`?section=`) : changer de sous-onglet ne recharge pas la page, l'aperçu et « Faire parler »
// gardent leur état.
const FoxRoute = () => {
  const { section } = useSearch({ from: "/settings/fox" });
  const navigate = useNavigate({ from: "/settings/fox" });
  return (
    <FoxSettingsTab
      sectionId={section}
      onSelectSection={(next) => void navigate({ search: { section: next } })}
    />
  );
};

export const Route = createFileRoute("/settings/fox")({
  validateSearch: FoxSearchSchema,
  component: FoxRoute,
});
