import { describe, expect, it } from "vitest";
import {
  isClipName,
  isSameTrim,
  toChatFileName,
  toClipMime,
  toClipStem,
  toConfirmationName,
  toConfirmChoice,
  toConfirmedName,
  toEndPhraseJson,
  toFreeName,
  toPreviousName,
  toRawClips,
} from "./clip.rules";
import { toLaughsJson } from "./laugh.rules";
import { LAUGH_PHRASE } from "./show.rules";

describe("isClipName", () => {
  it("accepte un nom de fichier vidéo seul : .mp4, .mkv et .mov, majuscules comprises", () => {
    expect(isClipName("Replay 2026-10-15 15-09-05.mp4")).toBe(true);
    expect(isClipName("partie.mkv")).toBe(true);
    expect(isClipName("PARTIE.MOV")).toBe(true);
  });

  it("refuse tout ce qui n'est pas un fichier vidéo", () => {
    expect(isClipName("notes.txt")).toBe(false);
    expect(isClipName("Replay.mp4.json")).toBe(false);
    expect(isClipName("mp4")).toBe(false);
    expect(isClipName("")).toBe(false);
  });

  it("refuse un chemin : sous-dossier, remontée, chemin absolu, lecteur Windows, flux de données", () => {
    expect(isClipName("../secret.mp4")).toBe(false);
    expect(isClipName("..\\secret.mp4")).toBe(false);
    expect(isClipName("a/../b.mp4")).toBe(false);
    expect(isClipName("Traités/clip.mp4")).toBe(false);
    expect(isClipName("Traités\\clip.mp4")).toBe(false);
    expect(isClipName("/etc/clip.mp4")).toBe(false);
    expect(isClipName("C:\\Windows\\clip.mp4")).toBe(false);
    expect(isClipName("clip.mp4:stream")).toBe(false);
    expect(isClipName("clip..mp4")).toBe(false);
  });

  it("refuse un nom avec un caractère de contrôle ou un nom trop long", () => {
    expect(isClipName("clip\u0000.mp4")).toBe(false);
    expect(isClipName("clip\n.mp4")).toBe(false);
    expect(isClipName(`${"a".repeat(260)}.mp4`)).toBe(false);
  });
});

describe("toClipStem", () => {
  it("retire la dernière extension seulement", () => {
    expect(toClipStem("Replay 2026-10-15 15-09-05.mp4")).toBe("Replay 2026-10-15 15-09-05");
    expect(toClipStem("a.b.mkv")).toBe("a.b");
  });
});

describe("toClipMime", () => {
  it("donne le type de chaque extension", () => {
    expect(toClipMime("a.mp4")).toBe("video/mp4");
    expect(toClipMime("a.MKV")).toBe("video/x-matroska");
    expect(toClipMime("a.mov")).toBe("video/quicktime");
  });
});

describe("toRawClips", () => {
  const files = [
    { name: "ancien.mp4", modifiedAt: 1000, size: 10 },
    { name: "récent.mp4", modifiedAt: 3000, size: 10 },
    { name: "milieu.mkv", modifiedAt: 2000, size: 10 },
    { name: "notes.txt", modifiedAt: 5000, size: 1 },
    { name: "égal-b.mp4", modifiedAt: 2000, size: 10 },
  ];

  it("garde les fichiers vidéo, du plus récent au plus ancien, à date égale par nom décroissant", () => {
    expect(toRawClips(files).map(({ name }) => name)).toEqual([
      "récent.mp4",
      "milieu.mkv",
      "égal-b.mp4",
      "ancien.mp4",
    ]);
  });
});

describe("toFreeName", () => {
  it("garde le nom quand il est libre", () => {
    expect(toFreeName("a.mp4", () => false)).toBe("a.mp4");
  });

  it("ajoute (2), (3)… avant l'extension tant que le nom est pris", () => {
    const taken = new Set(["a.mp4", "a (2).mp4"]);
    expect(toFreeName("a.mp4", (name) => taken.has(name))).toBe("a (3).mp4");
  });
});

describe("les noms à côté d'un clip", () => {
  it("donne le nom du clip confirmé (toujours .mp4), de son JSON et de son chat", () => {
    expect(toConfirmedName("Replay 2026-10-15 15-09-05.mkv")).toBe("Replay 2026-10-15 15-09-05.mp4");
    expect(toConfirmationName("Replay 2026-10-15 15-09-05.mp4")).toBe("Replay 2026-10-15 15-09-05.json");
    expect(toChatFileName("Replay 2026-10-15 15-09-05.mp4")).toBe("Replay 2026-10-15 15-09-05.chat.json");
  });
});

describe("toPreviousName", () => {
  it("nomme l'ancienne version d'une vidéo confirmée avant son extension", () => {
    expect(toPreviousName("Replay 2026-10-15 15-09-05.mp4")).toBe(
      "Replay 2026-10-15 15-09-05 (ancienne version).mp4",
    );
    expect(toPreviousName("a (2).mp4")).toBe("a (2) (ancienne version).mp4");
  });
});

describe("isSameTrim", () => {
  it("reconnaît le même début et la même fin, à un millième de seconde près", () => {
    expect(isSameTrim({ start: 2.1, end: 7.4667 }, { start: 2.1, end: 7.4667 })).toBe(true);
    expect(isSameTrim({ start: 2.1, end: 7.4667 }, { start: 2.1004, end: 7.4662 })).toBe(true);
  });

  it("voit un début ou une fin déplacés d'une image (1/60 s)", () => {
    expect(isSameTrim({ start: 2.1, end: 7.4667 }, { start: 2.1167, end: 7.4667 })).toBe(false);
    expect(isSameTrim({ start: 2.1, end: 7.4667 }, { start: 2.1, end: 7.45 })).toBe(false);
  });
});

describe("toConfirmChoice", () => {
  const request = {
    name: "a.mp4",
    title: "  Le saut  ",
    phrase: " Quel saut ! ",
    endPhrase: " Bien joué. ",
    start: 1.5,
    end: 20,
  };

  it("accepte un titre, une phrase de début, une phrase de fin et une partie du clip, titre et phrases sans blancs de bord", () => {
    expect(toConfirmChoice(request, 118.55)).toEqual({
      ok: true,
      value: { title: "Le saut", phrase: "Quel saut !", endPhrase: "Bien joué.", start: 1.5, end: 20 },
    });
  });

  it("accepte une phrase de début vide : Jean-Renard se tait", () => {
    const result = toConfirmChoice({ ...request, phrase: "   " }, 118.55);
    expect(result.ok && result.value.phrase).toBe("");
  });

  it("accepte une phrase de fin vide : Jean-Renard se tait après le clip, et la phrase de fin est quand même écrite", () => {
    const result = toConfirmChoice({ ...request, endPhrase: "   " }, 118.55);
    expect(result.ok && "endPhrase" in result.value).toBe(true);
    expect(result.ok && result.value.endPhrase).toBe("");
  });

  it("garde les rires posés, triés par instant, le sound de chacun sans blancs de bord", () => {
    expect(
      toConfirmChoice(
        {
          ...request,
          laughs: [
            { at: 9, sound: " bbbb0002 " },
            { at: 2.5, sound: "aaaa0001" },
          ],
        },
        100,
      ),
    ).toMatchObject({
      ok: true,
      value: {
        laughs: [
          { at: 2.5, sound: "aaaa0001" },
          { at: 9, sound: "bbbb0002" },
        ],
      },
    });
  });

  it("n'écrit pas de rires quand il n'y en a pas : absents ou liste vide", () => {
    for (const laughs of [undefined, []]) {
      const result = toConfirmChoice({ ...request, laughs }, 100);
      expect(result.ok && "laughs" in result.value).toBe(false);
    }
  });

  it("garde un rire hors de la partie gardée : une recoupe peut le ramener dedans, sa fin ne le borne pas", () => {
    const result = toConfirmChoice({ ...request, laughs: [{ at: 90, sound: "aaaa0001" }] }, 100);
    expect(result).toMatchObject({ ok: true, value: { end: 20, laughs: [{ at: 90, sound: "aaaa0001" }] } });
  });

  it("refuse un rire dont le sound est vide ou fait plus de 64 caractères", () => {
    const message = "un rire doit désigner un sound (1 à 64 caractères)";
    expect(toConfirmChoice({ ...request, laughs: [{ at: 1, sound: "x".repeat(65) }] }, 100)).toEqual({
      ok: false,
      message,
    });
    expect(toConfirmChoice({ ...request, laughs: [{ at: 1, sound: "   " }] }, 100)).toEqual({
      ok: false,
      message,
    });
    expect(toConfirmChoice({ ...request, laughs: [{ at: 1, sound: "x".repeat(64) }] }, 100).ok).toBe(true);
  });

  it("refuse un rire à un instant négatif ou qui n'est pas un nombre fini", () => {
    const message = "l'instant d'un rire doit être un nombre positif ou nul";
    for (const at of [-0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(toConfirmChoice({ ...request, laughs: [{ at, sound: "aaaa0001" }] }, 100)).toEqual({
        ok: false,
        message,
      });
    }
    expect(toConfirmChoice({ ...request, laughs: [{ at: 0, sound: "aaaa0001" }] }, 100).ok).toBe(true);
  });

  it("garde le volume des rires, de 0 à 100 %, et n'en écrit aucun quand la demande n'en a pas : absent vaut 100", () => {
    for (const laughFader of [0, 35, 100]) {
      expect(toConfirmChoice({ ...request, laughFader }, 100)).toMatchObject({
        ok: true,
        value: { laughFader },
      });
    }
    const result = toConfirmChoice(request, 100);
    expect(result.ok && "laughFader" in result.value).toBe(false);
  });

  it("refuse un volume des rires qui n'est pas un entier de 0 à 100", () => {
    const message = "le volume des rires doit être un nombre entier de 0 à 100";
    for (const laughFader of [-1, 101, 55.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(toConfirmChoice({ ...request, laughFader }, 100)).toEqual({ ok: false, message });
    }
  });

  it("accepte 50 rires au plus", () => {
    const laughs = (count: number) => Array.from({ length: count }, (_, at) => ({ at, sound: "aaaa0001" }));
    expect(toConfirmChoice({ ...request, laughs: laughs(50) }, 100).ok).toBe(true);
    expect(toConfirmChoice({ ...request, laughs: laughs(51) }, 100)).toEqual({
      ok: false,
      message: "un clip ne peut pas avoir plus de 50 rires",
    });
  });

  it("refuse un titre vide ou trop long", () => {
    expect(toConfirmChoice({ ...request, title: "   " }, 100)).toEqual({
      ok: false,
      message: "le titre est obligatoire",
    });
    expect(toConfirmChoice({ ...request, title: "a".repeat(121) }, 100)).toEqual({
      ok: false,
      message: "le titre ne peut pas dépasser 120 caractères",
    });
  });

  it("refuse une phrase de début trop longue", () => {
    expect(toConfirmChoice({ ...request, phrase: "a".repeat(501) }, 100)).toEqual({
      ok: false,
      message: "la phrase de début ne peut pas dépasser 500 caractères",
    });
    expect(toConfirmChoice({ ...request, phrase: "a".repeat(500) }, 100).ok).toBe(true);
  });

  it("refuse une phrase de fin trop longue", () => {
    expect(toConfirmChoice({ ...request, endPhrase: "a".repeat(501) }, 100)).toEqual({
      ok: false,
      message: "la phrase de fin ne peut pas dépasser 500 caractères",
    });
    expect(toConfirmChoice({ ...request, endPhrase: "a".repeat(500) }, 100).ok).toBe(true);
  });

  it("refuse un début négatif, un début qui ne précède pas la fin d'au moins une image, ou une fin au-delà de la durée", () => {
    expect(toConfirmChoice({ ...request, start: -1 }, 100)).toEqual({
      ok: false,
      message: "le début ne peut pas être négatif",
    });
    expect(toConfirmChoice({ ...request, start: 10, end: 10 }, 100)).toEqual({
      ok: false,
      message: "le début doit précéder la fin d'au moins une image",
    });
    expect(toConfirmChoice({ ...request, start: 10, end: 9 }, 100)).toEqual({
      ok: false,
      message: "le début doit précéder la fin d'au moins une image",
    });
    expect(toConfirmChoice({ ...request, start: 0, end: 120 }, 100)).toEqual({
      ok: false,
      message: "la fin (120 s) dépasse la durée du clip (100 s)",
    });
  });

  it("ramène à la durée du clip une fin qui la dépasse de moins de 0,1 s (le lecteur et ffprobe arrondissent différemment)", () => {
    const result = toConfirmChoice({ ...request, start: 0, end: 118.6 }, 118.55);
    expect(result.ok && result.value.end).toBe(118.55);
  });
});

describe("toEndPhraseJson : le JSON d'avant la phrase de fin", () => {
  const legacy = {
    title: "Le saut",
    phrase: "Quel saut !",
    start: 2,
    end: 12.5,
    laughs: [{ at: 3, sound: "abcd1234" }],
  };

  it("lit avec la phrase des rires, comme phrase de fin, un JSON qui a des rires et pas de clé endPhrase", () => {
    expect(toEndPhraseJson(legacy)).toEqual({ ...legacy, endPhrase: LAUGH_PHRASE });
    expect(LAUGH_PHRASE).toBe("Les rires sont enregistrés. Personne n'a ri.");
  });

  it("ne bouge pas un JSON qui a déjà une phrase de fin, même vide : Alexis a choisi", () => {
    const written = { ...legacy, endPhrase: "Bien joué." };
    expect(toEndPhraseJson(written)).toEqual(written);
    const silent = { ...legacy, endPhrase: "" };
    expect(toEndPhraseJson(silent)).toEqual(silent);
    expect(toEndPhraseJson(silent)).toHaveProperty("endPhrase", "");
  });

  it("n'ajoute rien à un JSON sans rires : absents, vides ou pas une liste", () => {
    const { laughs, ...without } = legacy;
    expect(toEndPhraseJson(without)).toEqual(without);
    expect(toEndPhraseJson(without)).not.toHaveProperty("endPhrase");
    expect(toEndPhraseJson({ ...legacy, laughs: [] })).not.toHaveProperty("endPhrase");
    expect(toEndPhraseJson({ ...legacy, laughs: "abcd1234" })).not.toHaveProperty("endPhrase");
  });

  it("reçoit la phrase aussi quand un très vieux `laugh` vient de devenir `laughs` : la conversion des rires passe avant", () => {
    const { laughs, ...base } = legacy;
    const json = toEndPhraseJson(toLaughsJson({ ...base, laugh: "abcd1234" }));
    expect(json).toEqual({ ...base, laughs: [{ at: 12.5, sound: "abcd1234" }], endPhrase: LAUGH_PHRASE });
  });

  it("rend tel quel ce qui n'est pas un objet JSON", () => {
    expect(toEndPhraseJson(null)).toBeNull();
    expect(toEndPhraseJson("texte")).toBe("texte");
    expect(toEndPhraseJson([legacy])).toEqual([legacy]);
  });
});
