import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { EditableSettings } from "../../domain/settings.schema";
import { SettingTime } from "./setting-time";
import type { UseSettings } from "./use-settings";

const spec = {
  key: "foxEndTime",
  label: "Fin prévue",
  help: "HH:MM. Vide : pas de fin prévue.",
} as const;

const settings = (byKey: Partial<Record<string, string>> = {}): UseSettings => ({
  view: null,
  drafts: {},
  errors: { byKey, general: [] },
  edit: () => undefined,
  choose: async () => undefined,
  change: async () => true,
  reset: async () => undefined,
});

const render = (effective: Partial<EditableSettings>, byKey: Partial<Record<string, string>> = {}): string =>
  renderToStaticMarkup(
    createElement(SettingTime, { spec, settings: settings(byKey), effective: effective as EditableSettings }),
  );

describe("le champ d'une heure", () => {
  it("montre l'heure qui s'applique, sous son libellé et son aide", () => {
    const html = render({ foxEndTime: "00:30" });
    expect(html).toContain("Fin prévue");
    expect(html).toContain('value="00:30"');
    expect(html).toContain("HH:MM. Vide : pas de fin prévue.");
    expect(html).toContain('placeholder="HH:MM"');
    expect(html).toContain('maxLength="5"');
  });

  it("montre un champ vide quand il n'y a pas de fin prévue, ou pas de réglage", () => {
    expect(render({ foxEndTime: "" })).toContain('value=""');
    expect(render({})).toContain('value=""');
  });

  it("écrit le refus du serveur sous le champ", () => {
    const html = render({ foxEndTime: "25:00" }, { foxEndTime: "doit s'écrire HH:MM" });
    expect(html).toContain('role="alert"');
    expect(html).toContain("doit s&#x27;écrire HH:MM");
  });

  it("n'écrit aucune alerte sans refus", () => {
    expect(render({ foxEndTime: "21:00" })).not.toContain('role="alert"');
  });
});
