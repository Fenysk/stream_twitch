import { describe, expect, it } from "vitest";
import {
  isLiveMicOf,
  isMasterScene,
  type MicSource,
  MUTE_MIC_ID,
  type ObsMics,
  PC_MIC_ID,
  toCameraMicId,
  toControlMics,
  toDurationText,
  toListenedInput,
  toLiveMic,
  toMicPlan,
  toMicSources,
  toProgramScenes,
  toTakenMicId,
} from "./control.rules";
import type { ControlMic } from "./control.schema";

const PC = "Mic/Aux";
const OBS: ObsMics = {
  isPcMuted: false,
  cameras: [
    { number: 1, input: "Camera 1 OBS", isMuted: true },
    { number: 2, input: "Camera 2 OBS", isMuted: true },
  ],
};

describe("toMicSources", () => {
  it("met le mic du PC d'abord, puis celui de chaque caméra connectée dans l'ordre des numéros", () => {
    const sources = toMicSources(PC, OBS, [2, 1]);
    expect(sources.map(({ id, label, input, isMuted }) => ({ id, label, input, isMuted }))).toEqual([
      { id: "pc", label: "Micro du PC", input: PC, isMuted: false },
      { id: "camera-1", label: "Caméra 1", input: "Camera 1 OBS", isMuted: true },
      { id: "camera-2", label: "Caméra 2", input: "Camera 2 OBS", isMuted: true },
    ]);
  });

  it("ne garde que les caméras connectées, et une seule fois chacune", () => {
    expect(toMicSources(PC, OBS, [2, 2]).map(({ id }) => id)).toEqual(["pc", "camera-2"]);
    expect(toMicSources(PC, OBS, []).map(({ id }) => id)).toEqual(["pc"]);
  });

  it("garde une caméra connectée dont la source n'existe pas dans OBS, sans entrée et coupée", () => {
    const [, camera] = toMicSources(PC, { isPcMuted: false, cameras: [] }, [3]);
    expect(camera).toEqual({ id: "camera-3", label: "Caméra 3", input: null, isMuted: true });
  });

  it("tient le mic du PC pour sans entrée et coupé quand OBS ne le connaît pas", () => {
    const [pc] = toMicSources(PC, { isPcMuted: null, cameras: [] }, []);
    expect(pc).toEqual({ id: "pc", label: "Micro du PC", input: null, isMuted: true });
  });
});

describe("toControlMics", () => {
  it("dit ouvert un micro que l'entrée connaît et qu'OBS n'a pas coupé, disponible un micro qui a son entrée", () => {
    const sources = toMicSources(
      PC,
      { isPcMuted: false, cameras: [{ number: 1, input: "C1", isMuted: true }] },
      [1, 2],
    );
    expect(toControlMics(sources)).toEqual([
      { id: "pc", label: "Micro du PC", isOpen: true, isAvailable: true },
      { id: "camera-1", label: "Caméra 1", isOpen: false, isAvailable: true },
      { id: "camera-2", label: "Caméra 2", isOpen: false, isAvailable: false },
    ]);
  });
});

describe("toListenedInput", () => {
  const sources = (pc: boolean, camera1: boolean, camera2: boolean): MicSource[] =>
    toMicSources(
      PC,
      {
        isPcMuted: pc,
        cameras: [
          { number: 1, input: "C1", isMuted: camera1 },
          { number: 2, input: "C2", isMuted: camera2 },
        ],
      },
      [1, 2],
    );

  it("Quand le mic du PC est ouvert, le système doit faire écouter l'entrée du PC, même si une caméra l'est aussi", () => {
    expect(toListenedInput(sources(false, true, true), PC, [])).toBe(PC);
    expect(toListenedInput(sources(false, false, true), PC, [])).toBe(PC);
  });

  it("Quand le mic du PC est coupé et celui d'une caméra ouvert, le système doit faire écouter l'entrée de la caméra", () => {
    expect(toListenedInput(sources(true, false, true), PC, [])).toBe("C1");
    expect(toListenedInput(sources(true, true, false), PC, [])).toBe("C2");
  });

  it("prend la caméra du plus petit numéro quand plusieurs sont ouvertes", () => {
    expect(toListenedInput(sources(true, false, false), PC, [])).toBe("C1");
  });

  it("revient à l'entrée du PC quand aucun micro n'est ouvert : son silence dit que Fenysk est muet", () => {
    expect(toListenedInput(sources(true, true, true), PC, [])).toBe(PC);
  });

  it("garde le nom du PC que les réglages donnent, même quand OBS ne connaît pas cette entrée", () => {
    expect(toListenedInput(toMicSources("Autre", { isPcMuted: null, cameras: [] }, []), "Autre", [])).toBe(
      "Autre",
    );
  });

  it("Quand le téléphone du mic ouvert se déconnecte, le système doit garder l'écoute sur sa source, restée ouverte dans OBS", () => {
    const cameras = [
      { number: 1, input: "C1", isMuted: false },
      { number: 2, input: "C2", isMuted: true },
    ];
    const withoutPhone = toMicSources(PC, { isPcMuted: true, cameras }, []);
    expect(toListenedInput(withoutPhone, PC, cameras)).toBe("C1");
    expect(toListenedInput(withoutPhone, PC, [{ number: 1, input: "C1", isMuted: true }])).toBe(PC);
  });

  it("préfère un mic de la liste, le PC d'abord, à la source ouverte d'un téléphone parti", () => {
    const cameras = [
      { number: 1, input: "C1", isMuted: false },
      { number: 2, input: "C2", isMuted: false },
    ];
    expect(toListenedInput(toMicSources(PC, { isPcMuted: false, cameras }, []), PC, cameras)).toBe(PC);
    expect(toListenedInput(toMicSources(PC, { isPcMuted: true, cameras }, [2]), PC, cameras)).toBe("C2");
  });
});

describe("toMicPlan", () => {
  const sources = toMicSources(
    PC,
    {
      isPcMuted: false,
      cameras: [
        { number: 1, input: "C1", isMuted: false },
        { number: 2, input: "C2", isMuted: true },
      ],
    },
    [1, 2, 3],
  );

  it("ouvre le micro demandé en coupant les autres entrées qui sont ouvertes, et seulement elles", () => {
    expect(toMicPlan(sources, "camera-2")).toEqual({
      kind: "open",
      label: "Caméra 2",
      input: "C2",
      toMute: [PC, "C1"],
    });
    expect(toMicPlan(sources, PC_MIC_ID)).toEqual({
      kind: "open",
      label: "Micro du PC",
      input: PC,
      toMute: ["C1"],
    });
  });

  it("ne coupe rien quand le micro demandé est déjà le seul ouvert", () => {
    const only = toMicSources(
      PC,
      { isPcMuted: true, cameras: [{ number: 1, input: "C1", isMuted: false }] },
      [1],
    );
    expect(toMicPlan(only, toCameraMicId(1))).toEqual({
      kind: "open",
      label: "Caméra 1",
      input: "C1",
      toMute: [],
    });
  });

  it("dit inconnu un micro que la régie n'a pas, et indisponible un micro dont OBS n'a pas l'entrée", () => {
    expect(toMicPlan(sources, "camera-9")).toEqual({ kind: "unknown" });
    expect(toMicPlan(sources, "camera-3")).toEqual({ kind: "unavailable", label: "Caméra 3" });
  });

  it("Quand le micro demandé est Muet, le système doit couper toutes les entrées ouvertes, sans en ouvrir aucune", () => {
    expect(toMicPlan(sources, MUTE_MIC_ID)).toEqual({ kind: "mute", toMute: [PC, "C1"] });
    const closed = toMicSources(PC, { isPcMuted: true, cameras: [] }, []);
    expect(toMicPlan(closed, MUTE_MIC_ID)).toEqual({ kind: "mute", toMute: [] });
  });

  it("réserve l'identifiant de Muet : ni le PC ni une caméra ne le portent", () => {
    expect(MUTE_MIC_ID).toBe("mute");
    expect(sources.some(({ id }) => id === MUTE_MIC_ID)).toBe(false);
  });
});

describe("toDurationText", () => {
  it("écrit minutes et secondes sous l'heure, sans zéro devant les minutes", () => {
    expect(toDurationText(0)).toBe("0:00");
    expect(toDurationText(102_000)).toBe("1:42");
    expect(toDurationText(12 * 60_000 + 5_000)).toBe("12:05");
    expect(toDurationText(59 * 60_000 + 59_999)).toBe("59:59");
  });

  it("ajoute les heures à partir d'une heure", () => {
    expect(toDurationText(3_600_000)).toBe("1:00:00");
    expect(toDurationText(3_600_000 + 2 * 60_000 + 5_000)).toBe("1:02:05");
  });

  it("ne descend jamais sous zéro", () => {
    expect(toDurationText(-5000)).toBe("0:00");
  });
});

describe("isMasterScene", () => {
  it("reconnaît une scène imbriquée dont le nom commence par « Master »", () => {
    for (const name of [
      "Master - Tchat",
      "Master - Background video",
      "Master - LivePlace",
      "Master - Webcam",
      "Master",
    ]) {
      expect(isMasterScene(name)).toBe(true);
    }
  });

  it("ne compte ni la casse ni les espaces de tête", () => {
    expect(isMasterScene("master - tchat")).toBe(true);
    expect(isMasterScene("MASTER - TCHAT")).toBe(true);
    expect(isMasterScene("   Master - Tchat")).toBe(true);
    expect(isMasterScene("	mAsTeR")).toBe(true);
  });

  it("ne prend pas une scène pour une scène de Master quand « Master » n'est pas au début de son nom", () => {
    for (const name of [
      "Jeu",
      "LivePlace",
      "Chill",
      "Pause",
      "Émission",
      "Mon Master - Tchat",
      "Mas ter",
      "",
    ]) {
      expect(isMasterScene(name)).toBe(false);
    }
  });
});

describe("toProgramScenes", () => {
  it("retire les scènes de Master et garde les autres, dans l'ordre d'OBS", () => {
    const scenes = [
      "Jeu",
      "Master - Tchat",
      "LivePlace",
      "master - Background video",
      "Chill",
      "Master - LivePlace",
      "Pause",
      "Master - Webcam",
      "Émission",
    ];
    expect(toProgramScenes(scenes)).toEqual(["Jeu", "LivePlace", "Chill", "Pause", "Émission"]);
  });

  it("rend une liste vide quand OBS n'a que des scènes de Master, ou aucune scène", () => {
    expect(toProgramScenes(["Master - Tchat", "  Master"])).toEqual([]);
    expect(toProgramScenes([])).toEqual([]);
  });
});

const mic = (id: string, isOpen: boolean): ControlMic => ({ id, label: id, isOpen, isAvailable: true });

describe("toLiveMic", () => {
  it("rend le micro ouvert : c'est celui qui parle au live", () => {
    expect(toLiveMic([mic("pc", false), mic("camera-1", true), mic("camera-2", false)])?.id).toBe("camera-1");
    expect(toLiveMic([mic("pc", true), mic("camera-1", false)])?.id).toBe("pc");
  });

  it("rend le premier quand OBS en laisse plusieurs ouverts à la main : celui du PC avant les caméras, comme l'écoute de la tête", () => {
    expect(toLiveMic([mic("pc", true), mic("camera-1", true)])?.id).toBe("pc");
    expect(toLiveMic([mic("pc", false), mic("camera-1", true), mic("camera-2", true)])?.id).toBe("camera-1");
  });

  it("rend `null` quand aucun micro n'est ouvert, ou qu'il n'y en a aucun", () => {
    expect(toLiveMic([mic("pc", false), mic("camera-1", false)])).toBeNull();
    expect(toLiveMic([])).toBeNull();
  });

  it("suit une coupure faite à la main dans OBS : le micro rouvert devient celui du live", () => {
    const before = [mic("pc", true), mic("camera-1", false)];
    const after = [mic("pc", false), mic("camera-1", true)];
    expect(toLiveMic(before)?.id).toBe("pc");
    expect(toLiveMic(after)?.id).toBe("camera-1");
  });
});

describe("toTakenMicId", () => {
  it("Quand le bouton micro est touché, le système doit demander le micro de la caméra de ce téléphone", () => {
    expect(toTakenMicId(3)).toBe("camera-3");
    expect(toTakenMicId(1)).toBe(toCameraMicId(1));
  });

  it("ne rend jamais le micro au PC, quel que soit le numéro : le bouton prend, le menu des micros rend", () => {
    const ids = [1, 2, 3, 9999].map(toTakenMicId);
    expect(ids).toEqual(["camera-1", "camera-2", "camera-3", "camera-9999"]);
    expect(ids).not.toContain(PC_MIC_ID);
  });

  it("ne demande rien tant que le téléphone n'a pas de numéro : il n'a pas de micro à prendre", () => {
    expect(toTakenMicId(null)).toBeNull();
  });

  it("redemande le même micro à chaque toucher : la demande est la même que le micro soit déjà celui du live ou non", () => {
    const first = toTakenMicId(2);
    expect(first).toBe("camera-2");
    expect(toTakenMicId(2)).toBe(first);
  });
});

describe("isLiveMicOf", () => {
  const mics = [mic("pc", false), mic("camera-1", false), mic("camera-2", true)];

  it("dit si le micro du live est celui de la caméra de ce numéro", () => {
    expect(isLiveMicOf(mics, 2)).toBe(true);
    expect(isLiveMicOf(mics, 1)).toBe(false);
  });

  it("dit non quand le téléphone n'a pas de numéro, ou que le micro du PC est celui du live", () => {
    expect(isLiveMicOf(mics, null)).toBe(false);
    expect(isLiveMicOf([mic("pc", true), mic("camera-2", false)], 2)).toBe(false);
  });

  it("dit non quand aucun micro n'est ouvert", () => {
    expect(isLiveMicOf([mic("pc", false), mic("camera-2", false)], 2)).toBe(false);
    expect(isLiveMicOf([], 2)).toBe(false);
  });
});
