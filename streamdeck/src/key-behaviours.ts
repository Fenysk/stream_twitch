import {
  isPresetActive,
  toCycleBinding,
  toCycleChanges,
  toEffectiveCycleValue,
  toEffectiveToggle,
  toEffectiveValues,
  toPresetBinding,
  toPresetChanges,
  toToggleBinding,
  toToggleChanges,
} from "../../src/domain/deck.rules";
import type { CatalogueAnswer } from "../../src/domain/deck.schema";
import type { SettingsChanges, SettingsView } from "../../src/domain/settings.schema";
import { CYCLE_ACTION_UUID, PRESET_ACTION_UUID, TOGGLE_ACTION_UUID } from "./action-ids";
import { DEFAULT_PRESET_NAME, toSettingLabel, toValueLabel } from "./deck-catalogue";
import { SERVER_DOWN_TITLE, SERVER_TO_RESTART_TITLE } from "./server-request";
import type { FeedSnapshot } from "./settings-feed";

// Ce qu'une touche montre : son titre, et l'image de son état (0 : éteinte ou au repos, 1 : allumée ou active).
export type KeyDisplay = { title: string; state: number };

// Ce qui distingue les actions qui montrent un réglage : ce qu'elles écrivent, et ce qu'un appui change. Leur réglage vient du
// Stream Deck, donc `raw` n'est pas fiable.
export type KeyBehaviour = {
  uuid: string;
  display: (raw: unknown, snapshot: FeedSnapshot) => KeyDisplay;
  // Vrai quand la touche écrit le nom d'une expression : le plugin lit alors aussi leur liste.
  wantsExpressions: (raw: unknown) => boolean;
  // Les changements d'un appui, sur les réglages qui s'appliquent maintenant ; rien quand la touche n'a rien à changer.
  press: (raw: unknown, view: SettingsView) => SettingsChanges | undefined;
};

export const UNSET_TITLE = "Choisir\nun réglage";

// Un serveur qui ne répond pas ou mal : la touche le dit à la place de son réglage, image éteinte.
const toStatusDisplay = (snapshot: FeedSnapshot): KeyDisplay | undefined => {
  if (snapshot.status === "down") return { title: SERVER_DOWN_TITLE, state: 0 };
  if (snapshot.status === "to-restart") return { title: SERVER_TO_RESTART_TITLE, state: 0 };
  return undefined;
};

const toToggleDisplay = (raw: unknown, snapshot: FeedSnapshot): KeyDisplay => {
  const binding = toToggleBinding(raw);
  if (!binding) return { title: UNSET_TITLE, state: 0 };
  const name = binding.name || toSettingLabel(binding.setting);
  if (snapshot.status !== "ready") return toStatusDisplay(snapshot) ?? { title: name, state: 0 };
  const isOn = toEffectiveToggle(snapshot.view.effective, binding.setting);
  return { title: `${name}\n${isOn ? "ON" : "OFF"}`, state: isOn ? 1 : 0 };
};

export const TOGGLE_BEHAVIOUR: KeyBehaviour = {
  uuid: TOGGLE_ACTION_UUID,
  display: toToggleDisplay,
  wantsExpressions: () => false,
  press: (raw, view) => {
    const binding = toToggleBinding(raw);
    return binding ? toToggleChanges(binding, view.effective) : undefined;
  },
};

const toCycleDisplay = (raw: unknown, snapshot: FeedSnapshot): KeyDisplay => {
  const binding = toCycleBinding(raw);
  if (!binding) return { title: UNSET_TITLE, state: 0 };
  const name = binding.name || toSettingLabel(binding.setting);
  if (snapshot.status !== "ready") return toStatusDisplay(snapshot) ?? { title: name, state: 0 };
  const value = toEffectiveCycleValue(snapshot.view.effective, binding.setting);
  return { title: `${name}\n${toValueLabel(binding.setting, value, snapshot.expressions)}`, state: 0 };
};

export const CYCLE_BEHAVIOUR: KeyBehaviour = {
  uuid: CYCLE_ACTION_UUID,
  display: toCycleDisplay,
  wantsExpressions: (raw) => toCycleBinding(raw)?.setting === "expression",
  press: (raw, view) => {
    const binding = toCycleBinding(raw);
    return binding ? toCycleChanges(binding, view.effective) : undefined;
  },
};

const toPresetDisplay = (raw: unknown, snapshot: FeedSnapshot): KeyDisplay => {
  const binding = toPresetBinding(raw);
  if (!binding || (!binding.name && binding.pairs.length === 0)) return { title: UNSET_TITLE, state: 0 };
  const name = binding.name || DEFAULT_PRESET_NAME;
  if (snapshot.status !== "ready") return toStatusDisplay(snapshot) ?? { title: name, state: 0 };
  return { title: name, state: isPresetActive(binding, snapshot.view.effective) ? 1 : 0 };
};

export const PRESET_BEHAVIOUR: KeyBehaviour = {
  uuid: PRESET_ACTION_UUID,
  display: toPresetDisplay,
  wantsExpressions: () => false,
  press: (raw) => {
    const binding = toPresetBinding(raw);
    return binding ? toPresetChanges(binding) : undefined;
  },
};

// Ce que l'inspecteur reçoit : les valeurs qui s'appliquent et les expressions, ou pourquoi le serveur n'a pas pu les donner.
export const toCatalogueAnswer = (snapshot: FeedSnapshot): CatalogueAnswer => {
  if (snapshot.status === "ready") {
    return {
      status: "ready",
      values: toEffectiveValues(snapshot.view.effective),
      expressions: [...snapshot.expressions],
    };
  }
  return { status: snapshot.status === "to-restart" ? "to-restart" : "down" };
};
