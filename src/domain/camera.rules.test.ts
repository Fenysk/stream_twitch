import { describe, expect, it } from "vitest";
import {
  hasCamera,
  hasControl,
  toCameraAddress,
  toCameraMicAddress,
  toCameraName,
  toCameraNumber,
  toCameraOfAddress,
  toNextNumber,
  toRoleLabel,
  toRoleUrl,
  toSavedRole,
  toScreenOfAddress,
} from "./camera.rules";

describe("hasCamera", () => {
  it("compte le rôle Caméra et le Selfie comme des caméras, pas la régie", () => {
    expect(hasCamera("camera")).toBe(true);
    expect(hasCamera("selfie")).toBe(true);
    expect(hasCamera("control")).toBe(false);
  });
});

describe("hasControl", () => {
  it("donne la régie au téléphone Régie et au Selfie, pas au rôle Caméra", () => {
    expect(hasControl("control")).toBe(true);
    expect(hasControl("selfie")).toBe(true);
    expect(hasControl("camera")).toBe(false);
  });
});

describe("toCameraOfAddress", () => {
  const hosts = ["localhost:4747", "127.0.0.1:4747"];

  it("lit le numéro d'une source sur son hôte de caméra, comme `toCameraAddress` l'écrit", () => {
    expect(toCameraOfAddress(toCameraAddress(1, "4747"), hosts)).toBe(1);
    expect(toCameraOfAddress(toCameraAddress(12, "4747"), hosts)).toBe(12);
    expect(toCameraOfAddress("http://camera-2.localhost:4747/camera/2/", hosts)).toBe(2);
  });

  it("lit aussi une source de caméra posée sur localhost ou 127.0.0.1", () => {
    expect(toCameraOfAddress("http://localhost:4747/camera/3", hosts)).toBe(3);
    expect(toCameraOfAddress("http://127.0.0.1:4747/camera/3", hosts)).toBe(3);
  });

  it("refuse un autre port, un hôte de caméra d'un autre numéro, un chemin qui n'est pas une caméra et une adresse illisible", () => {
    expect(toCameraOfAddress("http://camera-1.localhost:4748/camera/1", hosts)).toBeNull();
    expect(toCameraOfAddress("http://camera-2.localhost:4747/camera/1", hosts)).toBeNull();
    expect(toCameraOfAddress("http://localhost:4747/show", hosts)).toBeNull();
    expect(toCameraOfAddress("http://localhost:4747/camera/abc", hosts)).toBeNull();
    expect(toCameraOfAddress("http://localhost:4747/camera/0", hosts)).toBeNull();
    expect(toCameraOfAddress("https://www.twitch.tv/camera/1", hosts)).toBeNull();
    expect(toCameraOfAddress("pas une adresse", hosts)).toBeNull();
    expect(toCameraOfAddress(undefined, hosts)).toBeNull();
  });
});

describe("la page mic d'une caméra", () => {
  const hosts = ["localhost:4747", "127.0.0.1:4747"];

  it("donne à la page mic l'adresse de la page image suivie de /mic, sur le même hôte", () => {
    expect(toCameraMicAddress(1, "4747")).toBe("http://camera-1.localhost:4747/camera/1/mic");
    expect(toCameraMicAddress(12, "4748")).toBe("http://camera-12.localhost:4748/camera/12/mic");
  });

  it("Quand une adresse est celle d'une page mic, le système ne doit pas la prendre pour une page image", () => {
    expect(toCameraOfAddress(toCameraMicAddress(1, "4747"), hosts)).toBeNull();
    expect(toCameraOfAddress("http://localhost:4747/camera/3/mic", hosts)).toBeNull();
    expect(toCameraOfAddress("http://camera-3.localhost:4747/camera/3/mic/", hosts)).toBeNull();
  });

  it("lit la sorte et le numéro d'une page, comme `toCameraAddress` et `toCameraMicAddress` l'écrivent", () => {
    expect(toScreenOfAddress(toCameraAddress(2, "4747"), hosts)).toEqual({ number: 2, kind: "image" });
    expect(toScreenOfAddress(toCameraMicAddress(2, "4747"), hosts)).toEqual({ number: 2, kind: "mic" });
    expect(toScreenOfAddress("http://localhost:4747/camera/3/mic", hosts)).toEqual({
      number: 3,
      kind: "mic",
    });
    expect(toScreenOfAddress("http://127.0.0.1:4747/camera/3/mic/", hosts)).toEqual({
      number: 3,
      kind: "mic",
    });
  });

  it("refuse, pour une page mic, un autre port, l'hôte d'un autre numéro, un chemin plus long et un numéro qui n'en est pas un", () => {
    expect(toScreenOfAddress("http://camera-1.localhost:4748/camera/1/mic", hosts)).toBeNull();
    expect(toScreenOfAddress("http://camera-2.localhost:4747/camera/1/mic", hosts)).toBeNull();
    expect(toScreenOfAddress("http://localhost:4747/camera/1/mic/extra", hosts)).toBeNull();
    expect(toScreenOfAddress("http://localhost:4747/camera/abc/mic", hosts)).toBeNull();
    expect(toScreenOfAddress("http://localhost:4747/camera/mic", hosts)).toBeNull();
    expect(toScreenOfAddress(undefined, hosts)).toBeNull();
  });
});

describe("toNextNumber", () => {
  it("donne 1 quand aucune caméra n'est prise", () => {
    expect(toNextNumber([])).toBe(1);
  });

  it("donne le plus petit numéro libre, même derrière un trou", () => {
    expect(toNextNumber([1, 2, 4])).toBe(3);
    expect(toNextNumber([2, 3])).toBe(1);
  });

  it("n'a pas de limite : derrière 1, 2 et 3, la quatrième est la 4", () => {
    expect(toNextNumber([3, 1, 2])).toBe(4);
  });
});

describe("toCameraNumber", () => {
  it("lit un numéro de caméra écrit simplement", () => {
    expect(toCameraNumber("1")).toBe(1);
    expect(toCameraNumber("12")).toBe(12);
    expect(toCameraNumber("9999")).toBe(9999);
  });

  it("refuse zéro, un numéro trop grand, un décimal, un texte et un nombre écrit autrement", () => {
    for (const text of ["0", "10000", "1.5", "-1", "abc", "", "03", "1e2", " 1"]) {
      expect(toCameraNumber(text)).toBeNull();
    }
  });
});

describe("les adresses et les noms", () => {
  it("nomme une caméra par son numéro", () => {
    expect(toCameraName(3)).toBe("Caméra 3");
  });

  it("donne à chaque caméra son hôte et son chemin, sur le port du serveur", () => {
    expect(toCameraAddress(1, "4747")).toBe("http://camera-1.localhost:4747/camera/1");
    expect(toCameraAddress(12, "4748")).toBe("http://camera-12.localhost:4748/camera/12");
  });

  it("ouvre /mobile sur un rôle depuis l'origine des téléphones", () => {
    expect(toRoleUrl("https://pcmasterrace.tail2d6b0a.ts.net", "control")).toBe(
      "https://pcmasterrace.tail2d6b0a.ts.net/mobile?role=control",
    );
  });

  it("appelle les rôles Caméra, Régie et Selfie", () => {
    expect(toRoleLabel("camera")).toBe("Caméra");
    expect(toRoleLabel("control")).toBe("Régie");
    expect(toRoleLabel("selfie")).toBe("Selfie");
  });
});

describe("toSavedRole", () => {
  it("rend le rôle gardé, et rien pour un texte inconnu ou un stockage vide", () => {
    expect(toSavedRole("selfie")).toBe("selfie");
    expect(toSavedRole("chef")).toBeNull();
    expect(toSavedRole(null)).toBeNull();
  });
});
