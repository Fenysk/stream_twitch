// Les réglages de la tête côté page : ils se lisent au serveur, et chaque geste valide s'applique en direct (un envoi au
// plus toutes les 80 ms : l'aperçu suit le curseur pendant qu'on le glisse). Un refus du serveur ne perd rien : les
// brouillons restent, le refus s'écrit sous le champ, et le changement suivant renvoie le tout.

import { useCallback, useEffect, useRef, useState } from "react";
import { SettingsRefusalSchema, type SettingsView, SettingsViewSchema } from "../../domain/settings.schema";
import type { SliderKey } from "./head-fields";
import {
  type Changes,
  type Drafts,
  type FieldErrors,
  toChanges,
  toFieldErrors,
  toRemainingDrafts,
} from "./settings-changes";

const SEND_EVERY_MS = 80;
const NO_ERRORS: FieldErrors = { byKey: {}, general: [] };

type Answer = { view: SettingsView } | { errors: FieldErrors };

const toAnswer = async (response: Response): Promise<Answer> => {
  const body: unknown = await response.json();
  const view = SettingsViewSchema.safeParse(body);
  if (response.ok && view.success) return { view: view.data };
  const refusal = SettingsRefusalSchema.safeParse(body);
  return {
    errors: toFieldErrors(
      refusal.success ? refusal.data.issues : [{ path: "", message: "réponse illisible" }],
    ),
  };
};

// Une requête de l'interface : jamais une exception, une réponse ou une erreur à montrer.
const ask = async (
  method: "GET" | "PUT" | "DELETE",
  changes?: Record<string, number | string | null>,
): Promise<Answer> => {
  try {
    const response = await fetch("/api/settings", {
      method,
      ...(changes
        ? { headers: { "content-type": "application/json" }, body: JSON.stringify({ changes }) }
        : {}),
    });
    return await toAnswer(response);
  } catch (error) {
    console.error("Réglages : le serveur ne répond pas", error);
    return { errors: toFieldErrors([{ path: "", message: "le serveur ne répond pas" }]) };
  }
};

export type UseSettings = {
  view: SettingsView | null;
  drafts: Drafts;
  errors: FieldErrors;
  edit: (key: SliderKey, value: number | null) => void;
  // L'expression active : son identifiant, ou `null` pour la photo. S'applique aussitôt, sans attendre de frappe.
  choose: (expression: string | null) => Promise<void>;
  reset: () => Promise<void>;
};

export const useSettings = (): UseSettings => {
  const [view, setView] = useState<SettingsView | null>(null);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [errors, setErrors] = useState<FieldErrors>(NO_ERRORS);
  // Les valeurs les plus récentes pour l'envoi différé, qui ne doit pas lire celles du rendu où il a été programmé.
  const latest = useRef({ view, drafts });
  latest.current = { view, drafts };
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isSending = useRef(false);
  const isResendNeeded = useRef(false);

  const take = useCallback((answer: Answer) => {
    if ("view" in answer) {
      setView(answer.view);
      setErrors(NO_ERRORS);
      setDrafts((current) => toRemainingDrafts(current, answer.view.local, answer.view.effective));
    } else setErrors(answer.errors);
  }, []);

  const flush = useCallback(async () => {
    if (isSending.current) {
      isResendNeeded.current = true;
      return;
    }
    const { view: shown, drafts: pending } = latest.current;
    if (!shown) return;
    const changes: Changes = toChanges(pending, shown.local, shown.effective);
    if (Object.keys(changes).length === 0) {
      setErrors(NO_ERRORS);
      return;
    }
    isSending.current = true;
    take(await ask("PUT", changes));
    isSending.current = false;
    if (isResendNeeded.current) {
      isResendNeeded.current = false;
      void flush();
    }
  }, [take]);

  useEffect(() => {
    void ask("GET").then(take);
    return () => clearTimeout(timer.current);
  }, [take]);

  const edit = useCallback(
    (key: SliderKey, value: number | null) => {
      setDrafts((current) => ({ ...current, [key]: value }));
      // Un envoi déjà prévu emportera aussi ce geste : l'envoi lit les brouillons les plus récents.
      if (timer.current !== undefined) return;
      timer.current = setTimeout(() => {
        timer.current = undefined;
        void flush();
      }, SEND_EVERY_MS);
    },
    [flush],
  );

  const choose = useCallback(
    async (expression: string | null) => {
      take(await ask("PUT", { expression }));
    },
    [take],
  );

  const reset = useCallback(async () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const answer = await ask("DELETE");
    take(answer);
    if ("view" in answer) setDrafts({});
  }, [take]);

  return { view, drafts, errors, edit, choose, reset };
};
