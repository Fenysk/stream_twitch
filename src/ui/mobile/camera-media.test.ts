import { describe, expect, it } from "vitest";
import {
  isPreviewMirrored,
  toCameraConstraints,
  toCameraFailure,
  toOtherFacing,
  toPreferredCodecs,
  toReframeConstraints,
  toTrackFraming,
  toVideoConstraints,
  VIDEO_MAX_BITRATE,
} from "./camera-media";

describe("toVideoConstraints", () => {
  it("demande 1920 × 1080 en 16:9 à 30 images par seconde, au mieux, sur la caméra arrière ou avant", () => {
    expect(toVideoConstraints("environment", "landscape")).toEqual({
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      aspectRatio: { ideal: 16 / 9 },
      frameRate: { ideal: 30 },
    });
    expect(toVideoConstraints("user", "landscape").facingMode).toEqual({ ideal: "user" });
  });

  it("Quand le Selfie est tenu en portrait, le système doit demander 1080 × 1920 en 9:16, sans recadrage", () => {
    expect(toVideoConstraints("user", "portrait")).toEqual({
      facingMode: { ideal: "user" },
      width: { ideal: 1080 },
      height: { ideal: 1920 },
      aspectRatio: { ideal: 9 / 16 },
      frameRate: { ideal: 30 },
    });
  });
});

describe("toTrackFraming", () => {
  it("dit le cadrage d'une piste d'après ses réglages : en largeur (16:9) ou en hauteur (9:16)", () => {
    expect(toTrackFraming({ width: 1920, height: 1080 })).toBe("landscape");
    expect(toTrackFraming({ width: 1080, height: 1920 })).toBe("portrait");
    expect(toTrackFraming({ width: 1280, height: 720 })).toBe("landscape");
    expect(toTrackFraming({ width: 720, height: 1280 })).toBe("portrait");
  });

  it("ne dit rien quand le navigateur ne donne pas la taille, ou qu'elle est carrée", () => {
    expect(toTrackFraming({})).toBeNull();
    expect(toTrackFraming({ width: 1920 })).toBeNull();
    expect(toTrackFraming({ height: 1080 })).toBeNull();
    expect(toTrackFraming({ width: 1080, height: 1080 })).toBeNull();
  });
});

describe("toReframeConstraints", () => {
  it("Quand l'image doit rester en 16:9, le système doit redemander 1920 × 1080 en 16:9, sans toucher à l'objectif ni à la cadence", () => {
    expect(toReframeConstraints("landscape", false)).toEqual({
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      aspectRatio: { ideal: 16 / 9 },
    });
  });

  it("Quand l'image doit rester en 9:16, le système doit redemander 1080 × 1920 en 9:16", () => {
    expect(toReframeConstraints("portrait", false)).toEqual({
      width: { ideal: 1080 },
      height: { ideal: 1920 },
      aspectRatio: { ideal: 9 / 16 },
    });
  });

  it("retourne la largeur et la hauteur quand Safari les entend dans l'autre sens", () => {
    expect(toReframeConstraints("landscape", true)).toEqual({
      width: { ideal: 1080 },
      height: { ideal: 1920 },
      aspectRatio: { ideal: 9 / 16 },
    });
    expect(toReframeConstraints("portrait", true)).toEqual(toReframeConstraints("landscape", false));
  });

  it("ne porte ni objectif ni cadence : la piste reste ouverte, sur la même caméra", () => {
    for (const framing of ["landscape", "portrait"] as const) {
      for (const isFlipped of [false, true]) {
        const constraints = toReframeConstraints(framing, isFlipped);
        expect(constraints).not.toHaveProperty("facingMode");
        expect(constraints).not.toHaveProperty("frameRate");
      }
    }
  });
});

describe("toCameraConstraints", () => {
  it("prend la caméra arrière par défaut du rôle Caméra et un mic avec le traitement vocal d'iOS : écho annulé, bruit réduit, gain automatique", () => {
    const constraints = toCameraConstraints("environment", "landscape");
    expect(constraints.video).toEqual(toVideoConstraints("environment", "landscape"));
    expect(constraints.audio).toEqual({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
  });
});

describe("isPreviewMirrored", () => {
  it("met en miroir l'aperçu de la caméra avant seulement : l'arrière montre l'image comme elle est", () => {
    expect(isPreviewMirrored("user")).toBe(true);
    expect(isPreviewMirrored("environment")).toBe(false);
  });
});

describe("toOtherFacing", () => {
  it("passe de l'arrière à l'avant et inversement", () => {
    expect(toOtherFacing("environment")).toBe("user");
    expect(toOtherFacing("user")).toBe("environment");
  });
});

describe("toPreferredCodecs", () => {
  const codecs = [
    { mimeType: "video/VP8" },
    { mimeType: "video/H264", sdpFmtpLine: "profile-level-id=42e01f" },
    { mimeType: "video/rtx" },
    { mimeType: "video/h264", sdpFmtpLine: "profile-level-id=640c1f" },
    { mimeType: "video/AV1" },
  ];

  it("met H.264 devant, sans changer l'ordre de ses variantes ni celui des autres codecs", () => {
    expect(toPreferredCodecs(codecs).map(({ mimeType }) => mimeType)).toEqual([
      "video/H264",
      "video/h264",
      "video/VP8",
      "video/rtx",
      "video/AV1",
    ]);
  });

  it("garde l'ordre quand le navigateur n'a pas H.264", () => {
    const without = [{ mimeType: "video/VP8" }, { mimeType: "video/AV1" }];
    expect(toPreferredCodecs(without)).toEqual(without);
  });
});

describe("VIDEO_MAX_BITRATE", () => {
  it("plafonne l'image à 6 Mb/s", () => {
    expect(VIDEO_MAX_BITRATE).toBe(6_000_000);
  });
});

describe("toCameraFailure", () => {
  it("dit « refusée » pour un refus de l'utilisateur ou du navigateur, « introuvable » sinon", () => {
    expect(toCameraFailure("NotAllowedError")).toBe("denied");
    expect(toCameraFailure("SecurityError")).toBe("denied");
    expect(toCameraFailure("NotFoundError")).toBe("unavailable");
    expect(toCameraFailure("NotReadableError")).toBe("unavailable");
    expect(toCameraFailure("")).toBe("unavailable");
  });
});
