import { toRoleLabel } from "../../domain/camera.rules";
import { PHONE_ROLES, type PhoneRole } from "../../domain/phone.schema";
import { ChoiceList, type ChoiceOption } from "../design/choice-list";

const ROLE_NOTES: Record<PhoneRole, string> = {
  camera: "Sur un trépied, sans tchat",
  control: "Le tchat et les touches",
  selfie: "Ta tête, le tchat, la régie",
};

const ROLE_CHOICES: readonly ChoiceOption<PhoneRole>[] = PHONE_ROLES.map((role) => ({
  value: role,
  label: toRoleLabel(role),
  note: ROLE_NOTES[role],
}));

// Le premier écran d'un téléphone qui n'a pas de rôle : trois choix, aucun présélectionné. Un toucher choisit et passe à l'écran du
// rôle.
export const RolePicker = ({ onPick }: { onPick: (role: PhoneRole) => void }) => (
  <main className="role-picker">
    <h1 className="lp-type-heading">Ce téléphone sert de…</h1>
    <ChoiceList label="Rôle du téléphone" options={ROLE_CHOICES} value={null} onSelect={onPick} />
  </main>
);
