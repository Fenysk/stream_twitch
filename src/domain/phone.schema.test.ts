import { describe, expect, it } from "vitest";
import {
  LinkRequestSchema,
  MobileSearchSchema,
  NumberRequestSchema,
  PhoneEventSchema,
  PhoneQuerySchema,
  PhoneSummarySchema,
  ScreenEventSchema,
  ScreenQuerySchema,
  SignalRequestSchema,
  SignalSchema,
} from "./phone.schema";

const OFFER = { kind: "offer", session: "session-0001", description: "v=0\r\n" };
const CANDIDATE = {
  kind: "candidate",
  session: "session-0001",
  candidate: { candidate: "candidate:1 1 udp 1 192.168.1.20 5000 typ host", sdpMid: "0", sdpMLineIndex: 0 },
};

describe("SignalSchema", () => {
  it("accepte une offre, une réponse et un candidat", () => {
    expect(SignalSchema.safeParse(OFFER).success).toBe(true);
    expect(SignalSchema.safeParse({ ...OFFER, kind: "answer" }).success).toBe(true);
    expect(SignalSchema.safeParse(CANDIDATE).success).toBe(true);
  });

  it("accepte un candidat sans mid ni ligne de média, comme certains navigateurs en envoient", () => {
    const bare = { ...CANDIDATE, candidate: { ...CANDIDATE.candidate, sdpMid: null, sdpMLineIndex: null } };
    expect(SignalSchema.safeParse(bare).success).toBe(true);
  });

  it("refuse un signal inconnu, une session trop courte et une description vide", () => {
    expect(SignalSchema.safeParse({ ...OFFER, kind: "hangup" }).success).toBe(false);
    expect(SignalSchema.safeParse({ ...OFFER, session: "abc" }).success).toBe(false);
    expect(SignalSchema.safeParse({ ...OFFER, description: "" }).success).toBe(false);
  });
});

describe("les évènements du serveur", () => {
  it("dit à un téléphone son numéro (vide pour la régie), sa page OBS, ses signaux, si sa caméra est à l'antenne et si son mic est celui du live", () => {
    expect(PhoneEventSchema.safeParse({ kind: "number", number: 3 }).success).toBe(true);
    expect(PhoneEventSchema.safeParse({ kind: "number", number: null }).success).toBe(true);
    const image = { screenKind: "image" };
    expect(PhoneEventSchema.safeParse({ kind: "screen", ...image, screenId: "screen-0001" }).success).toBe(
      true,
    );
    expect(PhoneEventSchema.safeParse({ kind: "screen", ...image, screenId: null }).success).toBe(true);
    expect(PhoneEventSchema.safeParse({ kind: "signal", ...image, signal: OFFER }).success).toBe(true);
    expect(PhoneEventSchema.safeParse({ kind: "air", isOnAir: true }).success).toBe(true);
    expect(PhoneEventSchema.safeParse({ kind: "air", isOnAir: "oui" }).success).toBe(false);
    expect(PhoneEventSchema.safeParse({ kind: "mic", isLive: true }).success).toBe(true);
    expect(PhoneEventSchema.safeParse({ kind: "mic", isLive: "oui" }).success).toBe(false);
  });

  it("dit à un téléphone la page active de chaque sorte (image ou mic), et refuse un évènement de page sans sorte ou d'une sorte inconnue", () => {
    expect(PhoneEventSchema.parse({ kind: "screen", screenKind: "mic", screenId: "screen-0002" })).toEqual({
      kind: "screen",
      screenKind: "mic",
      screenId: "screen-0002",
    });
    expect(PhoneEventSchema.parse({ kind: "signal", screenKind: "mic", signal: OFFER })).toEqual({
      kind: "signal",
      screenKind: "mic",
      signal: OFFER,
    });
    expect(PhoneEventSchema.safeParse({ kind: "screen", screenId: "screen-0001" }).success).toBe(false);
    expect(PhoneEventSchema.safeParse({ kind: "signal", signal: OFFER }).success).toBe(false);
    expect(
      PhoneEventSchema.safeParse({ kind: "screen", screenKind: "video", screenId: "screen-0001" }).success,
    ).toBe(false);
  });

  it("dit à une page OBS si son téléphone est là, et ses signaux", () => {
    expect(ScreenEventSchema.safeParse({ kind: "phone", isPresent: true }).success).toBe(true);
    expect(ScreenEventSchema.safeParse({ kind: "signal", signal: CANDIDATE }).success).toBe(true);
    expect(ScreenEventSchema.safeParse({ kind: "phone", isPresent: "oui" }).success).toBe(false);
  });
});

describe("les demandes au serveur", () => {
  it("garde de qui vient un signal : un téléphone ou une page OBS", () => {
    expect(
      SignalRequestSchema.safeParse({
        from: "phone",
        phoneId: "phone-0001",
        screenKind: "image",
        signal: OFFER,
      }).success,
    ).toBe(true);
    expect(
      SignalRequestSchema.safeParse({ from: "screen", screenId: "screen-0001", signal: OFFER }).success,
    ).toBe(true);
    expect(SignalRequestSchema.safeParse({ from: "phone", signal: OFFER }).success).toBe(false);
  });

  it("exige du téléphone à quelle sorte de page il parle, et refuse une sorte inconnue", () => {
    const toPhone = (screenKind?: string) => ({
      from: "phone",
      phoneId: "phone-0001",
      signal: OFFER,
      ...(screenKind === undefined ? {} : { screenKind }),
    });
    expect(SignalRequestSchema.parse(toPhone("mic"))).toEqual(toPhone("mic"));
    expect(SignalRequestSchema.safeParse(toPhone()).success).toBe(false);
    expect(SignalRequestSchema.safeParse(toPhone("video")).success).toBe(false);
  });

  it("refuse un numéro de caméra à zéro, décimal ou trop grand", () => {
    expect(NumberRequestSchema.safeParse({ phoneId: "phone-0001", number: 2 }).success).toBe(true);
    for (const number of [0, 1.5, 10_000]) {
      expect(NumberRequestSchema.safeParse({ phoneId: "phone-0001", number }).success).toBe(false);
    }
  });
});

describe("l'adresse des flux", () => {
  it("lit le téléphone : son identifiant, son rôle et le numéro qu'il a gardé", () => {
    expect(PhoneQuerySchema.parse({ id: "phone-0001", role: "camera", number: "3" })).toEqual({
      id: "phone-0001",
      role: "camera",
      number: 3,
    });
    expect(PhoneQuerySchema.parse({ id: "phone-0001", role: "control" })).toEqual({
      id: "phone-0001",
      role: "control",
    });
  });

  it("refuse un rôle inconnu et un numéro qui n'en est pas un", () => {
    expect(PhoneQuerySchema.safeParse({ id: "phone-0001", role: "chef" }).success).toBe(false);
    expect(PhoneQuerySchema.safeParse({ id: "phone-0001", role: "camera", number: "0" }).success).toBe(false);
    expect(PhoneQuerySchema.safeParse({ id: "phone-0001", role: "camera", number: "x" }).success).toBe(false);
  });

  it("lit la page OBS : son identifiant, le numéro de sa caméra et sa sorte, exigés", () => {
    expect(ScreenQuerySchema.parse({ id: "screen-0001", number: "12", kind: "mic" })).toEqual({
      id: "screen-0001",
      number: 12,
      kind: "mic",
    });
    expect(ScreenQuerySchema.safeParse({ id: "screen-0001", kind: "image" }).success).toBe(false);
    expect(ScreenQuerySchema.safeParse({ id: "screen-0001", number: "12" }).success).toBe(false);
    expect(ScreenQuerySchema.safeParse({ id: "screen-0001", number: "12", kind: "audio" }).success).toBe(
      false,
    );
  });
});

describe("Filmer : ce que le téléphone dit au serveur", () => {
  it("lit s'il est une caméra (Filmer est appuyé) et si sa caméra envoie une image : les deux sont exigés", () => {
    expect(
      LinkRequestSchema.parse({ from: "phone", phoneId: "phone-0001", isCamera: true, isFilming: false }),
    ).toEqual({ from: "phone", phoneId: "phone-0001", isCamera: true, isFilming: false });
    expect(
      LinkRequestSchema.safeParse({ from: "phone", phoneId: "phone-0001", isFilming: true }).success,
    ).toBe(false);
    expect(
      LinkRequestSchema.safeParse({ from: "phone", phoneId: "phone-0001", isCamera: true }).success,
    ).toBe(false);
    expect(
      LinkRequestSchema.safeParse({ from: "screen", screenId: "screen-0001", isLinked: true }).success,
    ).toBe(true);
  });

  it("ouvre le flux sans rôle : seuls l'identifiant et le numéro gardé comptent, un rôle d'une ancienne page est toléré", () => {
    expect(PhoneQuerySchema.parse({ id: "phone-0001" })).toEqual({ id: "phone-0001" });
    expect(PhoneQuerySchema.parse({ id: "phone-0001", number: "2" })).toEqual({
      id: "phone-0001",
      number: 2,
    });
  });

  it("résume un téléphone par son numéro (vide : il ne filme pas), sans rôle", () => {
    const summary = {
      id: "phone-0001",
      number: null,
      hasScreen: false,
      hasMicScreen: false,
      isReceiving: false,
      isHeard: false,
    };
    expect(PhoneSummarySchema.parse(summary)).toEqual(summary);
    expect(PhoneSummarySchema.parse({ ...summary, role: "camera" })).toEqual(summary);
  });
});

describe("MobileSearchSchema", () => {
  it("garde le rôle de ?role=, et ignore un rôle inconnu", () => {
    expect(MobileSearchSchema.parse({ role: "selfie" })).toEqual({ role: "selfie" });
    expect(MobileSearchSchema.parse({ role: "chef" })).toEqual({ role: undefined });
    expect(MobileSearchSchema.parse({})).toEqual({});
  });
});
