import { toInstantText } from "../../domain/instant.rules";
import type { ControlDeps } from "../../usecase/control.usecase";
import type { SettingsStore } from "../../usecase/settings.usecase";

// La fin prévue du live (`foxEndAt`) pour la régie : elle la remplace dans les réglages, qui peuvent la refuser (disque, valeur).
// Sans fin (`null`), le réglage redevient vide, comme les touches du Stream Deck le font.
export const toEndPort = (settings: Pick<SettingsStore, "update">): ControlDeps["end"] => ({
  update(endAt) {
    const update = settings.update({ foxEndAt: toInstantText(endAt) });
    return update.ok
      ? { ok: true }
      : { ok: false, message: update.issues.map(({ message }) => message).join(" ; ") };
  },
});
