import { describe, expect, it } from "vitest";
import { toEndLine, toFoxSourceLine, toTwitchLine, toViewersLine } from "./live-states";

describe("la ligne d'état des viewers", () => {
  it("dit le nombre de viewers d'un live en cours, au singulier jusqu'à un", () => {
    expect(toViewersLine({ kind: "live", count: 12 })).toMatchObject({ text: "12 viewers", tone: "good" });
    expect(toViewersLine({ kind: "live", count: 1 })).toMatchObject({ text: "1 viewer", tone: "good" });
    expect(toViewersLine({ kind: "live", count: 0 })).toMatchObject({ text: "0 viewer", tone: "good" });
  });

  it("dit « Hors ligne » sans alerter : ce n'est pas une panne", () => {
    expect(toViewersLine({ kind: "offline" })).toMatchObject({ text: "Hors ligne", tone: "neutral" });
  });

  it("dit « Inconnu » en alerte, et pourquoi", () => {
    const line = toViewersLine({ kind: "unknown" });
    expect(line).toMatchObject({ text: "Inconnu", tone: "warning" });
    expect(line.help).toContain("Twitch n'a pas répondu");
  });

  it("dit « Chargement… » tant que le serveur n'a pas répondu", () => {
    expect(toViewersLine(null)).toMatchObject({ text: "Chargement…", tone: "neutral" });
  });
});

describe("la ligne d'état de Twitch", () => {
  it("dit en tant que qui on est connecté, en bon état", () => {
    expect(toTwitchLine({ kind: "connected", login: "fenysk", missing: [] })).toMatchObject({
      text: "Connecté en tant que fenysk.",
      tone: "good",
    });
  });

  it("alerte quand le jeton ne couvre pas tout, et dit où se reconnecter", () => {
    const line = toTwitchLine({ kind: "connected", login: "fenysk", missing: ["reward"] });
    expect(line).toMatchObject({ text: "Connecté en tant que fenysk.", tone: "warning" });
    expect(line.help).toContain("onglet Twitch");
  });

  it("alerte quand Twitch n'est pas connecté, ou quand les identifiants manquent", () => {
    expect(toTwitchLine({ kind: "disconnected", lastError: null })).toMatchObject({
      text: "Non connecté.",
      tone: "warning",
    });
    const unavailable = toTwitchLine({ kind: "unavailable" });
    expect(unavailable.tone).toBe("warning");
    expect(unavailable.text).toContain("TWITCH_CLIENT_ID et TWITCH_CLIENT_SECRET manquent dans .env");
  });

  it("dit « Chargement… » tant que le serveur n'a pas répondu", () => {
    expect(toTwitchLine(null)).toMatchObject({ text: "Chargement…", tone: "neutral" });
  });
});

describe("la ligne d'état de la source du renard", () => {
  it("dit que la source OBS est ouverte et que le son en sort", () => {
    expect(toFoxSourceLine(true)).toMatchObject({ text: "Source OBS ouverte", tone: "good" });
    expect(toFoxSourceLine(true).help).toContain("OBS");
  });

  it("dit que la source OBS n'est pas ouverte et que le son sort de cette page", () => {
    expect(toFoxSourceLine(false)).toMatchObject({ text: "Source OBS non ouverte", tone: "neutral" });
    expect(toFoxSourceLine(false).help).toContain("cette page");
  });
});

describe("la ligne d'état de la fin du live", () => {
  const MINUTE = 60_000;
  const end = new Date(2026, 9, 14, 23, 0).getTime();
  const upcoming = (minutes: number) => toEndLine({ kind: "upcoming", end, remaining: minutes * MINUTE });
  const overtime = (minutes: number) => toEndLine({ kind: "overtime", end, elapsed: minutes * MINUTE });

  it("dit qu'il n'y a pas de fin prévue, sans alerter", () => {
    expect(toEndLine({ kind: "none" })).toEqual({ text: "Pas de fin prévue", tone: "neutral" });
  });

  it("dit l'heure de la fin et le temps qui reste, en heures et minutes au-delà d'une heure", () => {
    expect(upcoming(72)).toEqual({ text: "Fin à 23 h 00, dans 1 h 12", tone: "neutral" });
    expect(upcoming(60).text).toBe("Fin à 23 h 00, dans 1 h 00");
    expect(upcoming(61).text).toBe("Fin à 23 h 00, dans 1 h 01");
    expect(upcoming(45).text).toBe("Fin à 23 h 00, dans 45 min");
  });

  it("écrit l'heure du matin sans zéro devant les heures et avec deux chiffres de minutes", () => {
    const morning = new Date(2026, 9, 14, 9, 5).getTime();
    expect(toEndLine({ kind: "upcoming", end: morning, remaining: 10 * MINUTE }).text).toBe(
      "Fin à 9 h 05, dans 10 min",
    );
  });

  it("alerte à 15 min et moins, pas à 16", () => {
    expect(upcoming(16).tone).toBe("neutral");
    expect(upcoming(15).tone).toBe("warning");
    expect(upcoming(1)).toEqual({ text: "Fin à 23 h 00, dans 1 min", tone: "warning" });
  });

  it("arrondit le temps qui reste à la minute au-dessus : 30 s disent « 1 min »", () => {
    expect(toEndLine({ kind: "upcoming", end, remaining: 30_000 }).text).toBe("Fin à 23 h 00, dans 1 min");
    expect(toEndLine({ kind: "upcoming", end, remaining: 15 * MINUTE + 1 })).toMatchObject({
      text: "Fin à 23 h 00, dans 16 min",
      tone: "neutral",
    });
  });

  it("alerte une fois la fin dépassée, et dit de combien", () => {
    expect(overtime(5)).toEqual({ text: "Fin dépassée de 5 min", tone: "warning" });
    expect(overtime(80)).toEqual({ text: "Fin dépassée de 1 h 20", tone: "warning" });
  });

  it("arrondit le dépassement à la minute en dessous, et dit « moins d'1 min » avant la première", () => {
    expect(toEndLine({ kind: "overtime", end, elapsed: 59_999 })).toEqual({
      text: "Fin dépassée de moins d'1 min",
      tone: "warning",
    });
    expect(toEndLine({ kind: "overtime", end, elapsed: 61_000 }).text).toBe("Fin dépassée de 1 min");
  });
});
