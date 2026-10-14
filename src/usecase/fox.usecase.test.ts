import { describe, expect, it } from "vitest";
import type { FoxEvent } from "../domain/fox.schema";
import type { Settings } from "../domain/settings.schema";
import type { Voice } from "../domain/voice.schema";
import { createFox, type VoicePort } from "./fox.usecase";

const base: Settings = { obsAddress: "ws://127.0.0.1:4455", micName: "Mic/Aux", threshold: -40, delay: 250 };

const withFox: Settings = {
  ...base,
  foxVoice: "Microsoft Claude",
  foxSmallThreshold: -38,
  foxMediumThreshold: -26,
  foxLargeChance: 0.3,
  foxBounce: 0.04,
  foxBreathPeriod: 4000,
  foxBreath: 0.015,
  foxGazeMin: 5000,
  foxGazeMax: 15000,
  foxBlinkMin: 3000,
  foxBlinkMax: 6000,
  foxBlinkDuration: 150,
  foxListenMin: 2000,
  foxListenMax: 4000,
  foxReadSilence: 1000,
  foxStopAfter: 1000,
  foxReactionDuration: 1000,
  foxJoyDuration: 800,
  foxAwayAfter: 180_000,
  foxCrouchDuration: 300,
  foxJumpDuration: 400,
  foxDiveDuration: 800,
  foxReturnDuration: 800,
  foxYawnDuration: 2000,
};

const VOICES: Voice[] = [
  { name: "Microsoft Hortense", language: "fr-FR" },
  { name: "Microsoft David", language: "en-US" },
  { name: "Microsoft Claude", language: "fr-CA" },
];

// Un WAV valide de 500 ms (16 kHz, 16 bits, mono) : la durée se lit dans son en-tête.
const toWav = (samples: number): Uint8Array => {
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) =>
    bytes.set(
      Array.from(value, (character) => character.charCodeAt(0)),
      offset,
    );
  text(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16_000, true);
  view.setUint32(28, 32_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples * 2, true);
  return bytes;
};
const WAV = toWav(8000);

type Sound = { text: string; voice: string };

// Une fausse voix : elle note ce qu'on lui demande, et peut tomber en panne.
const setup = (settings: Settings = withFox, options: { isBroken?: boolean; wav?: Uint8Array } = {}) => {
  const state = { now: 1_000_000, ids: 0, lists: 0 };
  const sounds: Sound[] = [];
  const events: FoxEvent[] = [];
  const messages: string[] = [];
  const voices: VoicePort = {
    async list() {
      state.lists += 1;
      if (options.isBroken) throw new Error("PowerShell introuvable");
      return VOICES;
    },
    async synthesize(request) {
      if (options.isBroken) throw new Error("PowerShell introuvable");
      sounds.push(request);
      return options.wav ?? WAV;
    },
  };
  const fox = createFox({
    voices,
    settings,
    clock: () => state.now,
    createId: () => {
      state.ids += 1;
      return `id${state.ids}`;
    },
    toSpeechUrl: (id) => `/api/fox/speech/${id}`,
    log: (message) => messages.push(message),
  });
  // L'aperçu d'un onglet : il n'ajoute rien au nombre de pages /fox, il ne déclenche donc aucun évènement de comptage.
  fox.subscribe("preview", (event) => events.push(event));
  return { fox, state, sounds, events, messages };
};

describe("createFox : la prononciation", () => {
  const spoken = { ...withFox, foxPronunciations: ["wtf = what the fuck", "fenysk = Fénisque", "<3 = cœur"] };

  it("envoie à la synthèse « Merci Fénisque » pour « Merci Fenysk »", async () => {
    const { fox, sounds } = setup(spoken);
    await fox.speak("Merci Fenysk");
    expect(sounds).toEqual([{ text: "Merci Fénisque", voice: "Microsoft Claude" }]);
  });

  it("envoie « what the fuck » pour « wtf », sans tenir compte des majuscules", async () => {
    const { fox, sounds } = setup(spoken);
    await fox.speak("WTF ?");
    await fox.speak("wtf");
    expect(sounds.map(({ text }) => text)).toEqual(["what the fuck ?", "what the fuck"]);
  });

  it("l'applique à tout ce que dit le renard, un pseudo comme une phrase, et une abréviation faite de signes", async () => {
    const { fox, sounds } = setup(spoken);
    await fox.speak("Bienvenue Fenysk <3");
    expect(sounds[0]?.text).toBe("Bienvenue Fénisque cœur");
  });

  it("ne change pas un texte sans abréviation, ni sans prononciation réglée", async () => {
    const { fox, sounds } = setup(spoken);
    await fox.speak("Bonjour tout le monde");
    expect(sounds[0]?.text).toBe("Bonjour tout le monde");
    const bare = setup(withFox);
    await bare.fox.speak("wtf Fenysk");
    expect(bare.sounds[0]?.text).toBe("wtf Fenysk");
  });

  it("applique une prononciation changée en direct, à la phrase suivante", async () => {
    const { fox, sounds } = setup(withFox);
    await fox.speak("lol");
    fox.update({ ...withFox, foxPronunciations: ["lol = elle o elle"] });
    await fox.speak("lol");
    expect(sounds.map(({ text }) => text)).toEqual(["lol", "elle o elle"]);
  });

  it("compte dans le journal les caractères de ce qui est dit, une fois les abréviations dites", async () => {
    const { fox, messages } = setup(spoken);
    await fox.speak("wtf");
    expect(messages[0]).toContain(`${"what the fuck".length} caractères dits`);
  });

  it("garde l'ordre d'une phrase vide : rien à dire, rien à prononcer", async () => {
    const { fox, sounds } = setup(spoken);
    const result = await fox.speak("   ");
    expect(result.ok).toBe(false);
    expect(sounds).toEqual([]);
  });
});

describe("createFox : les règles", () => {
  it("donne les règles des réglages fox*, et aucune sans eux", () => {
    expect(setup().fox.getRules()?.smallThreshold).toBe(-38);
    expect(setup(base).fox.getRules()).toBeUndefined();
  });

  it("publie les nouvelles règles quand un réglage change, avec les valeurs appliquées", () => {
    const { fox, events } = setup();
    fox.update({ ...withFox, foxBounce: 0.06 });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "rules", rules: { bounce: 0.06, smallThreshold: -38 } });
    expect(fox.getRules()?.bounce).toBe(0.06);
  });

  it("ne publie rien quand les règles ne changent pas (un réglage de la tête, ou la voix)", () => {
    const { fox, events } = setup();
    fox.update({ ...withFox, threshold: -30 });
    fox.update({ ...withFox, foxVoice: "Microsoft Hortense" });
    expect(events).toEqual([]);
  });

  it("ne publie rien quand les réglages fox* disparaissent : les pages gardent leurs dernières règles", () => {
    const { fox, events } = setup();
    fox.update(base);
    expect(events).toEqual([]);
    expect(fox.getRules()).toBeUndefined();
  });

  it("n'envoie plus rien à qui s'est désabonné", () => {
    const { fox } = setup();
    const received: FoxEvent[] = [];
    const unsubscribe = fox.subscribe("preview", (event) => received.push(event));
    unsubscribe();
    fox.update({ ...withFox, foxBounce: 0.01 });
    expect(received).toEqual([]);
  });
});

describe("createFox : les pages /fox connectées", () => {
  const countsOf = (events: FoxEvent[]) =>
    events.flatMap((event) => (event.kind === "screens" ? [event.count] : []));

  it("n'en compte aucune au départ", () => {
    expect(setup().fox.getScreens()).toBe(0);
  });

  it("compte chaque page /fox qui se connecte, et le dit à toutes les pages, aperçu compris", () => {
    const { fox, events } = setup();
    fox.subscribe("screen", () => undefined);
    expect(fox.getScreens()).toBe(1);
    fox.subscribe("screen", () => undefined);
    expect(fox.getScreens()).toBe(2);
    expect(countsOf(events)).toEqual([1, 2]);
  });

  it("compte chaque page /fox qui se déconnecte, et le dit aux pages restantes", () => {
    const { fox, events } = setup();
    const first = fox.subscribe("screen", () => undefined);
    const second = fox.subscribe("screen", () => undefined);
    first();
    expect(fox.getScreens()).toBe(1);
    second();
    expect(fox.getScreens()).toBe(0);
    expect(countsOf(events)).toEqual([1, 2, 1, 0]);
  });

  it("ne compte pas les aperçus : ils ne changent pas qui parle", () => {
    const { fox, events } = setup();
    const unsubscribe = fox.subscribe("preview", () => undefined);
    expect(fox.getScreens()).toBe(0);
    unsubscribe();
    expect(fox.getScreens()).toBe(0);
    expect(countsOf(events)).toEqual([]);
  });

  it("ne retranche qu'une fois quand la même page se désabonne deux fois", () => {
    const { fox } = setup();
    fox.subscribe("screen", () => undefined);
    const second = fox.subscribe("screen", () => undefined);
    second();
    second();
    expect(fox.getScreens()).toBe(1);
  });

  it("prévient la page qui vient de se connecter du nombre de pages /fox, elle comprise", () => {
    const { fox } = setup();
    const received: FoxEvent[] = [];
    fox.subscribe("screen", (event) => received.push(event));
    expect(countsOf(received)).toEqual([1]);
  });
});

describe("createFox : les voix", () => {
  it("liste les voix françaises seulement", async () => {
    const { fox } = setup();
    expect(await fox.listVoices()).toEqual({
      ok: true,
      voices: [
        { name: "Microsoft Hortense", language: "fr-FR" },
        { name: "Microsoft Claude", language: "fr-CA" },
      ],
    });
  });

  it("interroge Windows une seule fois, pas à chaque ouverture de l'onglet", async () => {
    const { fox, state } = setup();
    await fox.listVoices();
    await fox.listVoices();
    expect(state.lists).toBe(1);
  });

  it("dit la panne, la journalise, et réessaie à l'appel suivant", async () => {
    const { fox, state, messages } = setup(withFox, { isBroken: true });
    const result = await fox.listVoices();
    expect(result).toEqual({ ok: false, message: "voix introuvables : PowerShell introuvable" });
    expect(messages.join(" ")).toContain("PowerShell introuvable");
    await fox.listVoices();
    expect(state.lists).toBe(2);
  });
});

describe("createFox : faire parler", () => {
  it("synthétise le texte avec la voix choisie, puis envoie l'adresse du WAV aux pages", async () => {
    const { fox, sounds, events } = setup();
    const result = await fox.speak("Bonjour les amis");
    expect(result).toEqual({ ok: true, url: "/api/fox/speech/id1", durationMs: 500 });
    expect(sounds).toEqual([{ text: "Bonjour les amis", voice: "Microsoft Claude" }]);
    expect(events).toEqual([{ kind: "speech", url: "/api/fox/speech/id1" }]);
  });

  it("prend la voix changée dans les réglages, dès l'appel suivant", async () => {
    const { fox, sounds } = setup();
    fox.update({ ...withFox, foxVoice: "Microsoft Hortense" });
    await fox.speak("Salut");
    expect(sounds[0]?.voice).toBe("Microsoft Hortense");
  });

  it("nettoie le texte avant de le donner à la voix", async () => {
    const { fox, sounds } = setup();
    await fox.speak("  Salut \n  toi \u0000 ");
    expect(sounds[0]?.text).toBe("Salut toi");
  });

  it("refuse un texte vide sans appeler la voix, et n'envoie rien", async () => {
    const { fox, sounds, events } = setup();
    expect(await fox.speak("  \n ")).toEqual({ ok: false, status: 400, message: "le texte est vide" });
    expect(sounds).toEqual([]);
    expect(events).toEqual([]);
  });

  it("refuse quand aucune voix n'est choisie (settings.json sans renard)", async () => {
    const { fox, sounds } = setup(base);
    const result = await fox.speak("Salut");
    expect(result).toMatchObject({ ok: false, status: 503 });
    expect(sounds).toEqual([]);
  });

  it("dit l'échec de la synthèse, le journalise sans le texte, et n'envoie rien", async () => {
    const { fox, events, messages } = setup(withFox, { isBroken: true });
    const result = await fox.speak("un secret du tchat");
    expect(result).toEqual({
      ok: false,
      status: 502,
      message: "la synthèse a échoué : PowerShell introuvable",
    });
    expect(events).toEqual([]);
    expect(messages.join(" ")).toContain("PowerShell introuvable");
    expect(messages.join(" ")).not.toContain("un secret du tchat");
  });

  it("journalise la voix, la longueur et le délai de synthèse, jamais le texte", async () => {
    const { fox, messages } = setup();
    await fox.speak("Bonjour les amis");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("Microsoft Claude");
    expect(messages[0]).toContain("16 caractères");
    expect(messages[0]).not.toContain("Bonjour");
  });
});

describe("createFox : la durée, l'annulation et l'arrêt d'une phrase", () => {
  it("rend la durée du WAV, lue dans son en-tête : la file du tchat avance à sa fin", async () => {
    const { fox } = setup();
    expect(await fox.speak("Bonjour")).toMatchObject({ ok: true, durationMs: 500 });
  });

  it("estime la durée à 16 kHz quand l'en-tête est illisible", async () => {
    const odd = new Uint8Array(16_000);
    const { fox } = setup(withFox, { wav: odd });
    expect(await fox.speak("Bonjour")).toMatchObject({ ok: true, durationMs: 500 });
  });

  it("n'envoie rien quand la phrase est annulée pendant la synthèse : ni évènement, ni WAV gardé", async () => {
    const { fox, events, messages } = setup();
    const result = await fox.speak("Bonjour", { isCancelled: () => true });
    expect(result).toEqual({ ok: false, status: 409, message: "la phrase a été annulée" });
    expect(events).toEqual([]);
    expect(fox.getSpeech("id1")).toBeUndefined();
    expect(messages).toEqual([]);
  });

  it("parle normalement quand elle n'est pas annulée", async () => {
    const { fox, events } = setup();
    expect(await fox.speak("Bonjour", { isCancelled: () => false })).toMatchObject({ ok: true });
    expect(events).toHaveLength(1);
  });

  it("dit aux pages d'arrêter la phrase en cours", () => {
    const { fox, events } = setup();
    fox.stop();
    expect(events).toEqual([{ kind: "stop" }]);
  });
});

describe("createFox : le mode et la présence", () => {
  it("commence au repos et caché", () => {
    const { fox } = setup();
    expect(fox.getMode()).toEqual({ kind: "idle" });
    expect(fox.getPresence()).toEqual({ kind: "away", elapsed: 0 });
  });

  it("publie le mode quand il change, et seulement alors", () => {
    const { fox, events } = setup();
    fox.updateMode({ kind: "listening" });
    fox.updateMode({ kind: "listening" });
    fox.updateMode({ kind: "reaction", image: "front-smile-rest" });
    fox.updateMode({ kind: "reaction", image: "front-smile-rest" });
    fox.updateMode({ kind: "reaction", image: "wink-tongue-rest" });
    expect(events).toEqual([
      { kind: "mode", mode: { kind: "listening" } },
      { kind: "mode", mode: { kind: "reaction", image: "front-smile-rest" } },
      { kind: "mode", mode: { kind: "reaction", image: "wink-tongue-rest" } },
    ]);
    expect(fox.getMode()).toEqual({ kind: "reaction", image: "wink-tongue-rest" });
  });

  it("publie la présence quand sa phase change, avec 0 ms écoulée", () => {
    const { fox, events } = setup();
    fox.updatePresence("leaving");
    fox.updatePresence("leaving");
    fox.updatePresence("away");
    expect(events).toEqual([
      { kind: "presence", presence: "leaving", elapsed: 0 },
      { kind: "presence", presence: "away", elapsed: 0 },
    ]);
  });

  it("dit depuis combien de ms il est dans sa phase : une page qui se connecte reprend la descente où elle en est", () => {
    const { fox, state } = setup();
    fox.updatePresence("leaving");
    state.now += 600;
    expect(fox.getPresence()).toEqual({ kind: "leaving", elapsed: 600 });
  });

  it("ne change pas sa présence quand une page /fox se connecte : caché ou visible, il le reste, et le temps continue", () => {
    const { fox, state, events } = setup();
    state.now += 4000;
    fox.subscribe("screen", () => undefined);
    expect(fox.getPresence()).toEqual({ kind: "away", elapsed: 4000 });
    expect(events.filter(({ kind }) => kind === "presence")).toEqual([]);
    fox.updatePresence("visible");
    state.now += 600;
    fox.subscribe("screen", () => undefined);
    expect(fox.getPresence()).toEqual({ kind: "visible", elapsed: 600 });
  });
});

describe("createFox : une phrase qui attend son tour (waitFor)", () => {
  it("ne part aux pages qu'une fois ce qu'elle attend fini : la synthèse se fait pendant la réaction", async () => {
    const { fox, events, sounds } = setup();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const speaking = fox.speak("Bonjour", { waitFor: gate });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(sounds).toHaveLength(1);
    expect(events).toEqual([]);
    release();
    expect(await speaking).toMatchObject({ ok: true });
    expect(events).toHaveLength(1);
  });

  it("n'envoie rien quand elle est annulée pendant l'attente", async () => {
    const { fox, events } = setup();
    const state = { isCancelled: false };
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const speaking = fox.speak("Bonjour", { waitFor: gate, isCancelled: () => state.isCancelled });
    state.isCancelled = true;
    release();
    expect(await speaking).toEqual({ ok: false, status: 409, message: "la phrase a été annulée" });
    expect(events).toEqual([]);
    expect(fox.getSpeech("id1")).toBeUndefined();
  });
});

describe("createFox : les WAV", () => {
  it("sert le WAV aux pages qui le demandent, plusieurs fois (l'aperçu et OBS)", async () => {
    const { fox } = setup();
    await fox.speak("Salut");
    expect(fox.getSpeech("id1")).toEqual(WAV);
    expect(fox.getSpeech("id1")).toEqual(WAV);
  });

  it("ne connaît pas un identifiant inventé", () => {
    expect(setup().fox.getSpeech("../../settings.json")).toBeUndefined();
  });

  it("oublie un WAV après 60 s : rien ne s'accumule en mémoire", async () => {
    const { fox, state } = setup();
    await fox.speak("Salut");
    state.now += 59_999;
    expect(fox.getSpeech("id1")).toEqual(WAV);
    state.now += 2;
    expect(fox.getSpeech("id1")).toBeUndefined();
  });

  it("n'en garde que huit : le plus ancien part quand un neuvième arrive", async () => {
    const { fox } = setup();
    for (let count = 0; count < 9; count += 1) await fox.speak("Salut");
    expect(fox.getSpeech("id1")).toBeUndefined();
    expect(fox.getSpeech("id2")).toEqual(WAV);
    expect(fox.getSpeech("id9")).toEqual(WAV);
  });
});

describe("createFox : l'humeur", () => {
  it("commence ordinaire", () => {
    const { fox } = setup();
    expect(fox.getAttitude()).toBe("plain");
  });

  it("publie l'humeur quand elle change, et seulement alors", () => {
    const { fox, events } = setup();
    fox.updateAttitude("plain");
    fox.updateAttitude("sulking");
    fox.updateAttitude("sulking");
    fox.updateAttitude("cheerful");
    expect(events).toEqual([
      { kind: "attitude", attitude: "sulking" },
      { kind: "attitude", attitude: "cheerful" },
    ]);
    expect(fox.getAttitude()).toBe("cheerful");
  });
});
