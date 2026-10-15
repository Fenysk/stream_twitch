import { Button } from "../../../src/ui/design/button";
import { CYCLE_ACTION_UUID, PHRASE_ACTION_UUID, PRESET_ACTION_UUID, TOGGLE_ACTION_UUID } from "../action-ids";
import type { CatalogueState } from "./catalogue-state";
import { CycleForm } from "./cycle-form";
import { PhraseForm } from "./phrase-form";
import { PresetForm } from "./preset-form";
import { ToggleForm } from "./toggle-form";

type InspectorProps = {
  // L'identifiant de l'action du manifest : il choisit le formulaire.
  action: string;
  settings: Record<string, unknown>;
  catalogue: CatalogueState;
  onChange: (settings: object) => void;
  onRetry: () => void;
};

const STATUS_TEXTS = {
  down: "Le serveur ne répond pas. Démarre-le, puis réessaie.",
  "to-restart": "Le serveur répond autre chose que prévu. Relance-le, puis réessaie.",
} as const;

// Le serveur n'a pas pu être lu : le choix du réglage reste possible, mais pas ses valeurs ni son état.
const ServerStatus = ({ catalogue, onRetry }: Pick<InspectorProps, "catalogue" | "onRetry">) => {
  if (catalogue.status !== "down" && catalogue.status !== "to-restart") return null;
  return (
    <section className="inspector-status" role="status">
      <p className="lp-type-caption lp-danger">{STATUS_TEXTS[catalogue.status]}</p>
      <Button label="Réessayer" onPress={onRetry} />
    </section>
  );
};

const Form = ({ action, settings, catalogue, onChange }: Omit<InspectorProps, "onRetry">) => {
  if (action === TOGGLE_ACTION_UUID)
    return <ToggleForm settings={settings} catalogue={catalogue} onChange={onChange} />;
  if (action === CYCLE_ACTION_UUID)
    return <CycleForm settings={settings} catalogue={catalogue} onChange={onChange} />;
  if (action === PRESET_ACTION_UUID)
    return <PresetForm settings={settings} catalogue={catalogue} onChange={onChange} />;
  if (action === PHRASE_ACTION_UUID) return <PhraseForm settings={settings} onChange={onChange} />;
  return <p className="lp-type-body lp-muted">Cette action n'a rien à régler.</p>;
};

export const Inspector = ({ action, settings, catalogue, onChange, onRetry }: InspectorProps) => (
  <main className="inspector">
    <Form action={action} settings={settings} catalogue={catalogue} onChange={onChange} />
    <ServerStatus catalogue={catalogue} onRetry={onRetry} />
  </main>
);
