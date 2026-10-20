import { toNamedSettings } from "../../domain/obs-ids.rules";
import type { CameraBoost } from "../../usecase/camera-boost.usecase";
import type { Control } from "../../usecase/control.usecase";
import type { ObsIds } from "../../usecase/obs-ids.usecase";
import type { SettingsStore } from "../../usecase/settings.usecase";
import type { ShowDirector } from "../../usecase/show-director.usecase";

export type FollowObsNamesDeps = {
  ids: Pick<ObsIds, "getNames" | "subscribe">;
  settings: Pick<SettingsStore, "getState" | "update">;
  boost: Pick<CameraBoost, "update">;
  control: Pick<Control, "update">;
  director: Pick<ShowDirector, "update">;
  log: (message: string) => void;
};

// Un nom que le suivi des identifiants change (une source ou une scène renommée dans OBS, une supprimée) va à ceux qui lisent les
// réglages qui le portent : le boost d'abord, il juge l'entrée écoutée d'après le nom du mic du PC, puis la régie et l'émission.
// La scène de fin d'émission renommée dans OBS met aussi à jour le réglage : l'onglet « Émission » montre la scène qu'OBS liste.
export function followObsNames({
  ids,
  settings,
  boost,
  control,
  director,
  log,
}: FollowObsNamesDeps): () => void {
  return ids.subscribe(({ key, to }) => {
    if (key === "showEndScene" && to !== undefined && to !== settings.getState().effective.showEndScene) {
      const update = settings.update({ showEndScene: to });
      if (!update.ok) {
        const reasons = update.issues.map(({ message }) => message).join(" ; ");
        log(`Réglages : la scène de fin « ${to} » n'est pas enregistrée (${reasons}).`);
      }
    }
    const named = toNamedSettings(settings.getState().effective, ids.getNames());
    boost.update(named);
    control.update(named);
    director.update(named);
  });
}
