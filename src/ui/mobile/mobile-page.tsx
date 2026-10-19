import { useEffect, useState } from "react";
import type { PhoneRole } from "../../domain/phone.schema";
import { toRoleFilmStart } from "../../domain/phone-layout.rules";
import { deleteSavedRole, getSavedRole, updateSavedRole } from "./mobile-storage";
import { PhoneScreen } from "./phone-screen";
import { RolePicker } from "./role-picker";

type MobilePageProps = {
  // Le `?role=` de l'adresse (celui d'un QR code) : il fixe le rôle sans passer par le choix.
  urlRole: PhoneRole | undefined;
  // Le téléphone change de rôle : l'adresse perd son `?role=`, sinon il reprendrait aussitôt le même.
  onLeaveUrlRole: () => void;
};

// La page du téléphone : le rôle de l'adresse, sinon celui que le téléphone a gardé, sinon le choix du rôle. Le rôle choisi est gardé. Il ne
// décide que de l'état de départ de l'écran unique (`toRoleFilmStart` : camera filme avec l'arrière, selfie avec l'avant, control ne filme
// pas) : filmer ou non se décide ensuite sur l'écran.
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
  return <PhoneScreen initialFilm={toRoleFilmStart(role)} onUpdateRole={forget} />;
};
