import { describe, expect, it } from "vitest";
import { IDLE_CONTROL } from "../../domain/control.schema";
import {
  CHAT_VIEWERS_NOTE,
  hasPicture,
  isMicMuted,
  toChatViewersCountText,
  toLiveText,
  toMarkText,
  toMicName,
  toMicText,
  toPictureText,
  toSceneText,
  toViewersText,
} from "./control-view";

describe("toLiveText", () => {
  it("dit « Hors ligne » quand OBS ne diffuse pas", () => {
    expect(toLiveText(IDLE_CONTROL, 5000)).toBe("Hors ligne");
  });

  it("écrit la durée du live, et la fait avancer du temps passé depuis l'état reçu", () => {
    const state = { ...IDLE_CONTROL, broadcast: { isLive: true, durationMs: 100_000 } };
    expect(toLiveText(state, 0)).toBe("Live 1:40");
    expect(toLiveText(state, 2000)).toBe("Live 1:42");
    expect(toLiveText(state, -5000)).toBe("Live 1:40");
  });

  it("passe à l'heure au-delà de 59 minutes", () => {
    const state = { ...IDLE_CONTROL, broadcast: { isLive: true, durationMs: 3_725_000 } };
    expect(toLiveText(state, 0)).toBe("Live 1:02:05");
  });
});

describe("toViewersText", () => {
  it("écrit le nombre de viewers, zéro compris", () => {
    expect(toViewersText({ kind: "live", count: 12 })).toEqual({ text: "12", title: "Viewers" });
    expect(toViewersText({ kind: "live", count: 0 }).text).toBe("0");
  });

  it("met un tiret sobre quand le live est hors ligne ou que le nombre est inconnu, et le dit au toucher", () => {
    expect(toViewersText({ kind: "offline" })).toEqual({ text: "–", title: "Live hors ligne" });
    expect(toViewersText({ kind: "unknown" })).toEqual({ text: "–", title: "Nombre de viewers inconnu" });
  });
});

describe("toSceneText", () => {
  it("écrit la scène à l'antenne, un tiret sans scène, et dit qu'OBS n'est pas joint", () => {
    expect(toSceneText({ ...IDLE_CONTROL, isLinked: true, scene: "Jeu" })).toBe("Jeu");
    expect(toSceneText({ ...IDLE_CONTROL, isLinked: true })).toBe("–");
    expect(toSceneText(IDLE_CONTROL)).toBe("OBS non joint");
  });
});

describe("toPictureText", () => {
  const state = (currentId: string | null) => ({
    ...IDLE_CONTROL,
    picture: {
      members: [
        { id: "pc", label: "PC", isAvailable: true },
        { id: "camera-1", label: "Caméra 1", isAvailable: true },
        { id: "head", label: "Tête", isAvailable: true },
      ],
      currentId,
    },
  });

  it("écrit « Plan : PC », « Plan : Caméra 1 » ou « Plan : Tête » d'après le membre qui occupe le plan", () => {
    expect(toPictureText(state("pc"))).toBe("Plan : PC");
    expect(toPictureText(state("camera-1"))).toBe("Plan : Caméra 1");
    expect(toPictureText(state("head"))).toBe("Plan : Tête");
  });

  it("met un tiret quand aucun membre n'occupe le plan, ou que le membre du plan n'est plus dans la place", () => {
    expect(toPictureText(state(null))).toBe("Plan : –");
    expect(toPictureText(state("camera-9"))).toBe("Plan : –");
  });

  it("n'a une pastille que si OBS a une place caméra", () => {
    expect(hasPicture(state("pc"))).toBe(true);
    expect(hasPicture(state(null))).toBe(true);
    expect(hasPicture(IDLE_CONTROL)).toBe(false);
  });
});

describe("toMicText", () => {
  const mics = (open: string | null) =>
    ["pc", "camera-1", "camera-2"].map((id) => ({
      id,
      label: id === "pc" ? "Micro du PC" : `Caméra ${id.slice(-1)}`,
      isOpen: id === open,
      isAvailable: true,
    }));
  const state = (open: string | null) => ({ ...IDLE_CONTROL, isLinked: true, mics: mics(open) });

  it("écrit « Micro : PC » quand le micro du PC parle au live", () => {
    expect(toMicText(state("pc"))).toBe("Micro : PC");
  });

  it("écrit le nom de la caméra quand c'est son micro qui parle au live", () => {
    expect(toMicText(state("camera-1"))).toBe("Micro : Caméra 1");
    expect(toMicText(state("camera-2"))).toBe("Micro : Caméra 2");
  });

  it("dit « Micro : Muet » quand OBS n'a aucun micro ouvert", () => {
    expect(toMicText(state(null))).toBe("Micro : Muet");
  });

  it("dit « Micro : ce tél. » quand le micro ouvert est la caméra de ce téléphone, et le nom de la caméra sinon", () => {
    expect(toMicText(state("camera-1"), 1)).toBe("Micro : ce tél.");
    expect(toMicText(state("camera-1"), 2)).toBe("Micro : Caméra 1");
    expect(toMicText(state("camera-1"), null)).toBe("Micro : Caméra 1");
    expect(toMicText(state("pc"), 1)).toBe("Micro : PC");
    expect(toMicText(state(null), 1)).toBe("Micro : Muet");
  });

  it("n'est Muet que si OBS est joint, connaît des micros et n'en a aucun d'ouvert", () => {
    expect(isMicMuted(state(null))).toBe(true);
    expect(isMicMuted(state("pc"))).toBe(false);
    expect(isMicMuted({ ...state(null), isLinked: false })).toBe(false);
    expect(isMicMuted({ ...IDLE_CONTROL, isLinked: true })).toBe(false);
    expect(isMicMuted(IDLE_CONTROL)).toBe(false);
  });

  it("nomme le micro du PC « PC » et celui d'une caméra par son nom", () => {
    expect(toMicName({ id: "pc", label: "Micro du PC" })).toBe("PC");
    expect(toMicName({ id: "camera-2", label: "Caméra 2" })).toBe("Caméra 2");
  });

  it("met un tiret quand OBS n'est pas joint ou que la régie n'a rien donné, au lieu de dire coupé", () => {
    expect(toMicText(IDLE_CONTROL)).toBe("Micro : –");
    expect(toMicText({ ...state(null), isLinked: false })).toBe("Micro : –");
    expect(toMicText({ ...IDLE_CONTROL, isLinked: true })).toBe("Micro : –");
  });

  it("suit une coupure faite à la main dans OBS : le micro rouvert devient celui du live", () => {
    expect(toMicText(state("pc"))).toBe("Micro : PC");
    expect(toMicText(state("camera-2"))).toBe("Micro : Caméra 2");
  });
});

describe("toChatViewersCountText", () => {
  it("écrit le nombre de personnes de la liste des viewers, au singulier jusqu'à une personne", () => {
    expect(toChatViewersCountText(0)).toBe("0 personne");
    expect(toChatViewersCountText(1)).toBe("1 personne");
    expect(toChatViewersCountText(2)).toBe("2 personnes");
    expect(toChatViewersCountText(1234)).toBe("1234 personnes");
  });

  it("précise que les viewers non connectés à Twitch n'apparaissent pas, et que le nombre du bandeau compte tout le monde", () => {
    expect(CHAT_VIEWERS_NOTE).toContain("pas connectés à Twitch");
    expect(CHAT_VIEWERS_NOTE).toContain("n'apparaissent pas");
    expect(CHAT_VIEWERS_NOTE).toContain("le nombre du bandeau compte tout le monde");
  });
});

describe("toMarkText", () => {
  it("écrit « supprimé » à côté d'un message supprimé par un modo, un ban ou un timeout", () => {
    expect(toMarkText("deleted")).toBe("supprimé");
  });

  it("n'écrit rien à côté d'un message que seul le téléphone montre (commande, bot) : il est seulement atténué", () => {
    expect(toMarkText("hidden")).toBe("");
  });

  it("n'écrit rien à côté d'un message qu'OBS montre aussi", () => {
    expect(toMarkText(null)).toBe("");
  });

  it("ne met un texte que pour « supprimé », et assez court pour tenir sur la ligne d'un message", () => {
    expect(toMarkText("deleted")).not.toBe(toMarkText("hidden"));
    expect(toMarkText("deleted").length).toBeLessThanOrEqual(20);
  });
});
