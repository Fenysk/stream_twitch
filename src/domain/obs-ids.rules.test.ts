import { describe, expect, it } from "vitest";
import {
  type ObsIdentity,
  toAlignedRecord,
  toConfiguredName,
  toNamedSettings,
  toObsKind,
  toObsLabel,
  toObsLine,
  toRenamedRecord,
  toResolution,
  toStartName,
} from "./obs-ids.rules";
import type { ObsIdRecord } from "./obs-ids.schema";
import type { Settings } from "./settings.schema";

const MIC: ObsIdentity = { uuid: "u-mic", name: "Mic/Aux" };
const RENAMED_MIC: ObsIdentity = { uuid: "u-mic", name: "Micro PC" };
const OTHER: ObsIdentity = { uuid: "u-other", name: "Autre" };
const TRACKED: ObsIdRecord = { configuredName: "Mic/Aux", uuid: "u-mic", name: "Mic/Aux" };

describe("toResolution : le premier passage", () => {
  it("retient la source qui porte le nom du réglage, et le dit", () => {
    expect(toResolution("Mic/Aux", undefined, [OTHER, MIC])).toEqual({
      name: "Mic/Aux",
      record: TRACKED,
      event: { kind: "tracked" },
    });
  });

  it("garde le nom du réglage quand aucune source ne le porte : rien n'est retenu, rien n'est dit", () => {
    expect(toResolution("Mic/Aux", undefined, [OTHER])).toEqual({
      name: "Mic/Aux",
      record: undefined,
      event: undefined,
    });
  });
});

describe("toResolution : une source déjà retenue", () => {
  it("la retrouve par son identifiant sans rien dire quand son nom n'a pas bougé", () => {
    expect(toResolution("Mic/Aux", TRACKED, [OTHER, MIC])).toEqual({
      name: "Mic/Aux",
      record: TRACKED,
      event: undefined,
    });
  });

  it("la retrouve sous son nouveau nom quand OBS l'a renommée, et le dit", () => {
    expect(toResolution("Mic/Aux", TRACKED, [OTHER, RENAMED_MIC])).toEqual({
      name: "Micro PC",
      record: { configuredName: "Mic/Aux", uuid: "u-mic", name: "Micro PC" },
      event: { kind: "renamed", from: "Mic/Aux" },
    });
  });

  it("revient au nom du réglage quand la source a disparu, et le dit", () => {
    const renamed = { ...TRACKED, name: "Micro PC" };
    expect(toResolution("Mic/Aux", renamed, [OTHER])).toEqual({
      name: "Mic/Aux",
      record: undefined,
      event: { kind: "lost", from: "Micro PC" },
    });
  });

  it("retient la source qui porte maintenant le nom du réglage quand la suivie a disparu", () => {
    const replacement: ObsIdentity = { uuid: "u-new", name: "Mic/Aux" };
    expect(toResolution("Mic/Aux", { ...TRACKED, name: "Micro PC" }, [replacement])).toEqual({
      name: "Mic/Aux",
      record: { configuredName: "Mic/Aux", uuid: "u-new", name: "Mic/Aux" },
      event: { kind: "lost", from: "Micro PC" },
    });
  });
});

describe("toResolution : un nom de réglage changé à la main", () => {
  it("l'emporte sur la source retenue, même si elle existe encore, et retient celle du nouveau nom", () => {
    expect(toResolution("Autre", TRACKED, [MIC, OTHER])).toEqual({
      name: "Autre",
      record: { configuredName: "Autre", uuid: "u-other", name: "Autre" },
      event: { kind: "tracked" },
    });
  });

  it("n'en retient aucune quand le nouveau nom n'existe pas dans OBS, sans rien dire", () => {
    expect(toResolution("Inconnue", TRACKED, [MIC, OTHER])).toEqual({
      name: "Inconnue",
      record: undefined,
      event: undefined,
    });
  });
});

describe("toStartName : le nom avant que OBS réponde", () => {
  it("prend le dernier nom connu de la source retenue pour ce réglage", () => {
    expect(toStartName("Mic/Aux", { ...TRACKED, name: "Micro PC" })).toBe("Micro PC");
  });

  it("prend le nom du réglage sans source retenue, ou quand le réglage a changé depuis", () => {
    expect(toStartName("Mic/Aux", undefined)).toBe("Mic/Aux");
    expect(toStartName("Autre", { ...TRACKED, name: "Micro PC" })).toBe("Autre");
  });
});

describe("toRenamedRecord", () => {
  const renamed = { kind: "input", uuid: "u-mic", from: "Mic/Aux", to: "Micro PC" } as const;

  it("donne le nouveau nom à la source retenue qu'OBS vient de renommer", () => {
    expect(toRenamedRecord("micName", TRACKED, "Mic/Aux", renamed)).toEqual({ ...TRACKED, name: "Micro PC" });
  });

  it("ne touche à rien quand c'est une autre source, un autre genre, ou que le réglage a changé depuis", () => {
    expect(toRenamedRecord("micName", TRACKED, "Mic/Aux", { ...renamed, uuid: "u-other" })).toBeUndefined();
    expect(toRenamedRecord("micName", TRACKED, "Mic/Aux", { ...renamed, kind: "scene" })).toBeUndefined();
    expect(toRenamedRecord("micName", TRACKED, "Autre", renamed)).toBeUndefined();
    expect(toRenamedRecord("micName", undefined, "Mic/Aux", renamed)).toBeUndefined();
  });
});

describe("toAlignedRecord", () => {
  it("garde la source retenue quand le réglage prend le nom qu'OBS lui donne déjà", () => {
    expect(toAlignedRecord({ ...TRACKED, name: "Micro PC" }, "Micro PC")).toEqual({
      configuredName: "Micro PC",
      uuid: "u-mic",
      name: "Micro PC",
    });
  });

  it("ne garde rien quand le réglage prend un autre nom, ou qu'aucune source n'était retenue", () => {
    expect(toAlignedRecord(TRACKED, "Autre")).toBeUndefined();
    expect(toAlignedRecord(undefined, "Autre")).toBeUndefined();
  });
});

describe("toConfiguredName", () => {
  it("laisse un nom, et ne voit rien dans un réglage absent ou vide", () => {
    expect(toConfiguredName("Master - Webcam")).toBe("Master - Webcam");
    expect(toConfiguredName("")).toBeUndefined();
    expect(toConfiguredName(undefined)).toBeUndefined();
  });
});

describe("toObsKind et toObsLabel", () => {
  it("disent si le réglage nomme une entrée ou une scène, et comment le journal l'appelle", () => {
    expect(toObsKind("micName")).toBe("input");
    expect(toObsKind("desktopName")).toBe("input");
    expect(toObsKind("cameraSlotScene")).toBe("scene");
    expect(toObsKind("showEndScene")).toBe("scene");
    expect(toObsLabel("micName")).toBe("Entrée du micro");
    expect(toObsLabel("desktopName")).toBe("Entrée du son du PC");
    expect(toObsLabel("cameraSlotScene")).toBe("Scène de la place caméra");
    expect(toObsLabel("showEndScene")).toBe("Scène de fin de l'émission");
  });
});

describe("toObsLine", () => {
  it("dit le renommage suivi", () => {
    expect(toObsLine("micName", { kind: "renamed", from: "Micro PC" }, "Mon micro")).toBe(
      "Entrée du micro renommée dans OBS : « Micro PC » → « Mon micro », suivie.",
    );
  });

  it("dit la source disparue et le nom des réglages qui reprend", () => {
    expect(toObsLine("cameraSlotScene", { kind: "lost", from: "Webcam" }, "Master - Webcam")).toBe(
      "Scène de la place caméra « Webcam » supprimée dans OBS : retour au nom des réglages, « Master - Webcam ».",
    );
  });

  it("dit la source retenue", () => {
    expect(toObsLine("desktopName", { kind: "tracked" }, "Audio PC")).toBe(
      "Entrée du son du PC « Audio PC » retenue par son identifiant : si OBS la renomme, elle reste suivie.",
    );
  });
});

describe("toNamedSettings", () => {
  const settings: Settings = {
    obsAddress: "ws://127.0.0.1:4455",
    micName: "Mic/Aux",
    desktopName: "Audio du bureau",
    cameraSlotScene: "Webcam",
    showEndScene: "",
    threshold: -40,
    delay: 250,
  };

  it("met les noms d'OBS à la place de ceux des réglages, et laisse le reste", () => {
    expect(toNamedSettings(settings, { micName: "Micro PC", showEndScene: "Fin" })).toEqual({
      ...settings,
      micName: "Micro PC",
      showEndScene: "Fin",
    });
  });

  it("ne change rien sans nom d'OBS", () => {
    expect(toNamedSettings(settings, {})).toEqual(settings);
  });
});
