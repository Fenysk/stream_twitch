// Ce que le téléphone garde pour lui entre deux ouvertures : son rôle, son identifiant et son numéro de caméra. Le stockage peut manquer
// ou refuser (navigation privée, données bloquées) : chaque lecture et chaque écriture se protège, et la page marche sans.

import { toCameraNumber, toSavedRole } from "../../domain/camera.rules";
import { ClientIdSchema, type PhoneRole } from "../../domain/phone.schema";
import { createRandomId } from "./random-id";

const ROLE_KEY = "stream-twitch:mobile:role";
const NUMBER_KEY = "stream-twitch:mobile:camera-number";
const PHONE_KEY = "stream-twitch:mobile:phone-id";

const getItem = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.warn("Mobile : stockage refusé, rien n'est relu", error);
    return null;
  }
};

const updateItem = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.warn("Mobile : stockage refusé, rien n'est gardé", error);
  }
};

const deleteItem = (key: string): void => {
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn("Mobile : stockage refusé, rien n'est effacé", error);
  }
};

export const getSavedRole = (): PhoneRole | null => toSavedRole(getItem(ROLE_KEY));
export const updateSavedRole = (role: PhoneRole): void => updateItem(ROLE_KEY, role);
export const deleteSavedRole = (): void => deleteItem(ROLE_KEY);

export const getSavedNumber = (): number | null => toCameraNumber(getItem(NUMBER_KEY) ?? "");
export const updateSavedNumber = (number: number): void => updateItem(NUMBER_KEY, String(number));

// L'identifiant de ce téléphone : créé à la première ouverture, puis gardé. Sans stockage, chaque ouverture en crée un autre.
export const getPhoneId = (): string => {
  const saved = getItem(PHONE_KEY);
  if (saved !== null && ClientIdSchema.safeParse(saved).success) return saved;
  const id = createRandomId();
  updateItem(PHONE_KEY, id);
  return id;
};
