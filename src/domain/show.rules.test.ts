import { describe, expect, it } from "vitest";
import type { ChatMessage } from "./chat.schema";
import type { ClipChat } from "./clip.schema";
import {
  CARD_AFTER_SPEECH_MS,
  CARD_MIN_MS,
  CLOSING_BANNER,
  LAUGH_AFTER_SPEECH_MS,
  LAUGH_PHRASE,
  LINE_AFTER_SPEECH_MS,
  LINE_MIN_MS,
  OPENING_BANNER,
  toCardMs,
  toChatSchedule,
  toDue,
  toLaughMs,
  toLaughSchedule,
  toLineMs,
  toLineup,
  toRecordedDay,
} from "./show.rules";

describe("toLineup", () => {
  const candidates = (...counts: number[]) =>
    counts.map((playCount, index) => ({ name: String.fromCharCode(97 + index), playCount }));

  it("ne rend rien sans clip, ni pour zéro clip demandé", () => {
    expect(toLineup([], 5, Math.random)).toEqual([]);
    expect(toLineup(candidates(0, 0), 0, Math.random)).toEqual([]);
  });

  it("passe les moins passés d'abord, et garde au plus le nombre demandé", () => {
    // a : 3 fois, b : jamais, c : 1 fois, d : jamais
    const lineup = toLineup(candidates(3, 0, 1, 0), 3, () => 0.999);
    expect(lineup).toEqual(["b", "d", "c"]);
  });

  it("laisse de côté les plus passés quand il y a plus de clips que demandé", () => {
    expect(toLineup(candidates(2, 0, 1, 0), 2, Math.random).sort()).toEqual(["b", "d"]);
  });

  it("passe tous les clips s'il y en a moins que demandé, chacun une fois", () => {
    const lineup = toLineup(candidates(1, 0, 2), 5, Math.random);
    expect(lineup).toEqual(["b", "a", "c"]);
  });

  it("départage au hasard ceux qui ont été passés autant de fois", () => {
    expect(toLineup(candidates(0, 0, 1), 2, () => 0.999)).toEqual(["a", "b"]);
    expect(toLineup(candidates(0, 0, 1), 2, () => 0)).toEqual(["b", "a"]);
  });

  it("ne change pas la liste qu'on lui donne", () => {
    const given = candidates(2, 0, 1);
    toLineup(given, 3, () => 0);
    expect(given).toEqual(candidates(2, 0, 1));
  });
});

describe("toRecordedDay", () => {
  it("lit le jour dans le nom que donne OBS au clip", () => {
    expect(
      toRecordedDay({ rawName: "Replay 2026-10-15 15-09-05.mp4", confirmedAt: "2026-10-16T10:00:00.000Z" }),
    ).toBe("2026-10-15");
  });

  it("prend le jour de la validation quand le nom n'a pas de date, ou une date impossible", () => {
    expect(toRecordedDay({ rawName: "mon clip.mp4", confirmedAt: "2026-10-16T10:00:00.000Z" })).toBe(
      "2026-10-16",
    );
    expect(toRecordedDay({ rawName: "Replay 2026-13-45.mp4", confirmedAt: "2026-10-16T10:00:00.000Z" })).toBe(
      "2026-10-16",
    );
  });
});

describe("les bandeaux de l'ouverture et de la clôture", () => {
  it("ont un petit texte et un titre chacun, différents", () => {
    expect(OPENING_BANNER.title).not.toBe(CLOSING_BANNER.title);
    expect(OPENING_BANNER.kicker).not.toBe(CLOSING_BANNER.kicker);
    expect(OPENING_BANNER.title).not.toBe("");
    expect(CLOSING_BANNER.title).not.toBe("");
  });
});

describe("toLineMs", () => {
  it("garde l'ouverture 2,5 s sans phrase", () => {
    expect(LINE_MIN_MS).toBe(2500);
    expect(toLineMs(null)).toBe(2500);
  });

  it("la garde jusqu'à la fin de la phrase plus 0,7 s", () => {
    expect(LINE_AFTER_SPEECH_MS).toBe(700);
    expect(toLineMs({ repliedAt: 1500, durationMs: 4000 })).toBe(6200);
  });

  it("ne descend pas sous 2,5 s pour une phrase courte", () => {
    expect(toLineMs({ repliedAt: 300, durationMs: 400 })).toBe(2500);
  });
});

describe("toCardMs", () => {
  it("garde le carton 3 s sans phrase", () => {
    expect(CARD_MIN_MS).toBe(3000);
    expect(toCardMs(null)).toBe(3000);
  });

  it("garde le carton jusqu'à la fin de la phrase plus 0,5 s : la synthèse prend du temps avant que la voix parte", () => {
    expect(CARD_AFTER_SPEECH_MS).toBe(500);
    expect(toCardMs({ repliedAt: 1800, durationMs: 4200 })).toBe(6500);
  });

  it("ne descend pas sous 3 s pour une phrase courte : le titre doit pouvoir se lire", () => {
    expect(toCardMs({ repliedAt: 500, durationMs: 400 })).toBe(3000);
  });
});

describe("les rires enregistrés", () => {
  it("disent une phrase fixe, sans technique", () => {
    expect(LAUGH_PHRASE).toBe("Les rires sont enregistrés. Personne n'a ri.");
  });

  it("laissent le clip jusqu'à la fin de la phrase plus 0,5 s, sans minimum", () => {
    expect(LAUGH_AFTER_SPEECH_MS).toBe(500);
    expect(toLaughMs({ repliedAt: 1200, durationMs: 3000 })).toBe(4700);
    expect(toLaughMs(null)).toBe(0);
  });
});

describe("toChatSchedule", () => {
  // Le clip brut de 120 s a été sauvegardé à l'instant 1 000 000 ms : il a donc commencé à 880 000. On en garde de 20 s à 50 s.
  const SAVED_AT = 1_000_000;
  const RAW_STARTED_AT = SAVED_AT - 120_000;
  const clip = { start: 20, end: 50, rawDuration: 120 };
  const message = (id: string, secondsIntoRaw: number): ChatMessage => ({
    id,
    nickname: "Viewer",
    color: null,
    fragments: [{ kind: "text", text: id }],
    isHidden: false,
    receivedAt: RAW_STARTED_AT + secondsIntoRaw * 1000,
  });
  const chat = (...messages: ChatMessage[]): ClipChat => ({ savedAt: SAVED_AT, messages });
  const ats = (entries: { at: number }[]) => entries.map(({ at }) => at);

  it("place un message à son instant dans la partie gardée, avancé de 4 s", () => {
    // 35 s dans le clip brut : 15 s dans la partie gardée, 11 s une fois avancé.
    expect(ats(toChatSchedule(chat(message("a", 35)), clip, 4000))).toEqual([11_000]);
  });

  it("garde le message lui-même tel que le tchat l'a reçu", () => {
    const sent = message("a", 35);
    expect(toChatSchedule(chat(sent), clip, 4000)[0]?.message).toEqual(sent);
  });

  it("ne garde ni les messages d'avant la partie gardée ni ceux d'après", () => {
    const entries = toChatSchedule(
      chat(message("avant", 10), message("dedans", 30), message("après", 100)),
      clip,
      0,
    );
    expect(entries.map(({ message: kept }) => kept.id)).toEqual(["dedans"]);
  });

  it("avance sans passer avant le début du clip : un message des 4 premières secondes paraît à 0", () => {
    expect(ats(toChatSchedule(chat(message("a", 21)), clip, 4000))).toEqual([0]);
  });

  it("garde un message d'après la fin quand son avance le fait paraître avant elle", () => {
    // 53 s dans le clip brut : 33 s dans la partie gardée (elle en dure 30), 29 s une fois avancé de 4 s.
    expect(ats(toChatSchedule(chat(message("a", 53)), clip, 4000))).toEqual([29_000]);
    expect(toChatSchedule(chat(message("a", 55)), clip, 4000)).toEqual([]);
  });

  it("les range dans l'ordre de leur apparition", () => {
    const entries = toChatSchedule(chat(message("b", 40), message("a", 30)), clip, 0);
    expect(entries.map(({ message: kept }) => kept.id)).toEqual(["a", "b"]);
  });

  it("ne rend rien d'un tchat vide, ni avec une avance plus longue que le clip", () => {
    expect(toChatSchedule(chat(), clip, 4000)).toEqual([]);
    expect(ats(toChatSchedule(chat(message("a", 30)), clip, 60_000))).toEqual([0]);
  });

  it("sans avance, garde l'instant exact du message", () => {
    expect(ats(toChatSchedule(chat(message("a", 20)), clip, 0))).toEqual([0]);
    expect(ats(toChatSchedule(chat(message("a", 49.5)), clip, 0))).toEqual([29_500]);
  });
});

describe("toDue", () => {
  const entries = [{ at: 0 }, { at: 500 }, { at: 1000 }, { at: 1500 }];

  it("rend ce qui paraît de `from` (compris) à `to` (exclu)", () => {
    expect(toDue(entries, 500, 1500)).toEqual([{ at: 500 }, { at: 1000 }]);
  });

  it("ne perd ni ne double rien entre deux appels qui se suivent", () => {
    const first = toDue(entries, 0, 700);
    const second = toDue(entries, 700, 1500);
    const third = toDue(entries, 1500, 2000);
    expect([...first, ...second, ...third]).toEqual(entries);
  });

  it("ne rend rien quand le temps n'avance pas", () => {
    expect(toDue(entries, 1000, 1000)).toEqual([]);
    expect(toDue([], 0, 1000)).toEqual([]);
  });
});

describe("toLaughSchedule", () => {
  // On garde de 20 s à 50 s du clip brut : un rire à 35 s part 15 s après le début du clip confirmé.
  const trim = { start: 20, end: 50 };

  it("place chaque rire à son instant en ms depuis le début du clip confirmé, avec son sound", () => {
    expect(
      toLaughSchedule(
        [
          { at: 35, sound: "aaaa0001" },
          { at: 20.5, sound: "bbbb0002" },
        ],
        trim,
      ),
    ).toEqual([
      { at: 500, sound: "bbbb0002" },
      { at: 15_000, sound: "aaaa0001" },
    ]);
  });

  it("écarte les rires d'avant la partie gardée et ceux d'après (une recoupe les a laissés sur leur moment)", () => {
    expect(
      toLaughSchedule(
        [
          { at: 10, sound: "avant" },
          { at: 30, sound: "dedans" },
          { at: 80, sound: "après" },
        ],
        trim,
      ),
    ).toEqual([{ at: 10_000, sound: "dedans" }]);
  });

  it("garde un rire pile au début (à 0) et un rire pile à la fin : il part quand la vidéo finit", () => {
    expect(
      toLaughSchedule(
        [
          { at: 50, sound: "fin" },
          { at: 20, sound: "début" },
        ],
        trim,
      ),
    ).toEqual([
      { at: 0, sound: "début" },
      { at: 30_000, sound: "fin" },
    ]);
  });

  it("ne rend jamais un instant négatif : un rire d'un millionième de seconde avant le début part à 0", () => {
    expect(toLaughSchedule([{ at: 20 - 1e-7, sound: "aaaa0001" }], trim)).toEqual([
      { at: 0, sound: "aaaa0001" },
    ]);
  });

  it("les range par instant, deux rires au même instant dans leur ordre", () => {
    const schedule = toLaughSchedule(
      [
        { at: 40, sound: "tard" },
        { at: 30, sound: "un" },
        { at: 30, sound: "deux" },
      ],
      trim,
    );
    expect(schedule.map(({ sound }) => sound)).toEqual(["un", "deux", "tard"]);
  });

  it("ne rend rien sans rires", () => {
    expect(toLaughSchedule([], trim)).toEqual([]);
  });
});
