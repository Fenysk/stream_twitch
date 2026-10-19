import { describe, expect, it } from "vitest";
import {
  type Orientation,
  toAlertRole,
  toFilmStart,
  toPhoneLayout,
  toRoleFilmStart,
} from "./phone-layout.rules";

const ORIENTATIONS: readonly Orientation[] = ["portrait", "landscape"];

describe("toPhoneLayout : filme × orientation → disposition", () => {
  it("Quand le téléphone ne filme pas, le système doit garder la même disposition en portrait et en paysage", () => {
    expect(toPhoneLayout(false, "portrait")).toBe("plain");
    expect(toPhoneLayout(false, "landscape")).toBe("plain");
  });

  it("Quand le téléphone filme, le système doit prendre la disposition de l'orientation : l'aperçu en haut en portrait, plein écran en paysage", () => {
    expect(toPhoneLayout(true, "portrait")).toBe("film-portrait");
    expect(toPhoneLayout(true, "landscape")).toBe("film-landscape");
  });

  it("donne quatre résultats pour quatre entrées, dont trois dispositions", () => {
    const layouts = [false, true].flatMap((isFilming) =>
      ORIENTATIONS.map((orientation) => toPhoneLayout(isFilming, orientation)),
    );
    expect(new Set(layouts)).toEqual(new Set(["plain", "film-portrait", "film-landscape"]));
  });
});

describe("toFilmStart : ce que Filmer demande à la caméra, pris à l'appui", () => {
  it("prend l'objectif avant en portrait, cadré en 9:16 : le téléphone se filme", () => {
    expect(toFilmStart("portrait")).toEqual({ facing: "user", framing: "portrait" });
  });

  it("prend l'objectif arrière en paysage, cadré en 16:9 : le téléphone filme devant lui", () => {
    expect(toFilmStart("landscape")).toEqual({ facing: "environment", framing: "landscape" });
  });

  it("Quand le téléphone tourne ensuite, la demande déjà prise ne change pas : seule la disposition suit l'orientation", () => {
    const start = toFilmStart("portrait");
    const layouts = ORIENTATIONS.map((orientation) => toPhoneLayout(true, orientation));
    expect(layouts).toEqual(["film-portrait", "film-landscape"]);
    expect(start).toEqual({ facing: "user", framing: "portrait" });
  });
});

describe("toRoleFilmStart : le ?role= d'un QR code déjà imprimé", () => {
  it("fait filmer avec la caméra arrière en 16:9 pour camera, avec l'avant en 9:16 pour selfie", () => {
    expect(toRoleFilmStart("camera")).toEqual({ facing: "environment", framing: "landscape" });
    expect(toRoleFilmStart("selfie")).toEqual({ facing: "user", framing: "portrait" });
  });

  it("ne fait pas filmer pour control", () => {
    expect(toRoleFilmStart("control")).toBeNull();
  });
});

describe("toAlertRole : l'ensemble d'alertes de chaque disposition", () => {
  it("garde les ensembles de R2 : la Régie sans filmer, le Selfie en portrait, la Caméra en paysage", () => {
    expect(toAlertRole("plain")).toBe("control");
    expect(toAlertRole("film-portrait")).toBe("selfie");
    expect(toAlertRole("film-landscape")).toBe("camera");
  });
});
