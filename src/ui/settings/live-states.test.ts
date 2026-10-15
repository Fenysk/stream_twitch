import { describe, expect, it } from "vitest";
import { toFoxSourceLine, toTwitchLine, toViewersLine } from "./live-states";

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
