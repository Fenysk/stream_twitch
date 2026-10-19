import { useEffect, useState } from "react";
import type { PhoneRole } from "../../domain/phone.schema";
import { CameraRole } from "./camera-role";
import { ControlRole } from "./control-role";
import { deleteSavedRole, getSavedRole, updateSavedRole } from "./mobile-storage";
import { RolePicker } from "./role-picker";
import { SelfieRole } from "./selfie-role";

type MobilePageProps = {
  // Le `?role=` de l'adresse (celui d'un QR code) : il fixe le rôle sans passer par le choix.
  urlRole: PhoneRole | undefined;
  // Le téléphone change de rôle : l'adresse perd son `?role=`, sinon il reprendrait aussitôt le même.
  onLeaveUrlRole: () => void;
};

// La page du téléphone : le rôle de l'adresse, sinon celui que le téléphone a gardé, sinon le choix du rôle. Le rôle choisi est gardé.
export const MobilePage = ({ urlRole, onLeaveUrlRole }: MobilePageProps) => {
  // `undefined` : le stockage du téléphone n'est pas encore lu (le serveur ne le voit pas, la première peinture reste vide).
  const [savedRole, setSavedRole] = useState<PhoneRole | null | undefined>(undefined);

  useEffect(() => setSavedRole(getSavedRole()), []);
  useEffect(() => {
    if (urlRole) updateSavedRole(urlRole);
  }, [urlRole]);

  const role = urlRole ?? savedRole;
  const pick = (next: PhoneRole) => {
    updateSavedRole(next);
    setSavedRole(next);
  };
  const forget = () => {
    deleteSavedRole();
    setSavedRole(null);
    onLeaveUrlRole();
  };

  if (role === undefined) return <main className="mobile-blank" />;
  if (role === null) return <RolePicker onPick={pick} />;
  if (role === "camera") return <CameraRole onUpdateRole={forget} />;
  if (role === "control") return <ControlRole onUpdateRole={forget} />;
  return <SelfieRole onUpdateRole={forget} />;
};
