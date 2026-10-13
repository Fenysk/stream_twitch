import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { toInsultList, toInsultMatch } from "../domain/chat-insults.rules";
import { getInsults } from "./insults.repository";

const PATH = join("moderation", "insults.fr.txt");
const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const createFile = (content: string): string => {
  const folder = mkdtempSync(join(tmpdir(), "insults-"));
  folders.push(folder);
  const path = join(folder, "insults.txt");
  writeFileSync(path, content);
  return path;
};

describe("getInsults : le fichier de la liste", () => {
  it("lit la liste du dépôt", () => {
    const list = getInsults(PATH);
    expect(list.parts.length).toBeGreaterThan(100);
    expect(list.words.size).toBeGreaterThan(50);
  });

  it("est assez fournie pour un vrai live : plus de 200 entrées", () => {
    const list = getInsults(PATH);
    expect(list.parts.length + list.words.size).toBeGreaterThan(200);
  });

  it("n'a aucune entrée perdue : chaque ligne devient une entrée (aucune trop courte, aucune sans lettre)", () => {
    const lines = readFileSync(PATH, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("#"));
    for (const line of lines) {
      const list = toInsultList(line);
      expect(list.parts.length + list.words.size, `« ${line} » est ignorée par toInsultList`).toBe(1);
    }
  });

  it("n'a aucune entrée en double une fois normalisée", () => {
    const lines = readFileSync(PATH, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("#"));
    const keys = lines.map((line) => {
      const list = toInsultList(line);
      return `${list.words.size > 0 ? "=" : ""}${[...list.words.keys(), ...list.parts.map(({ key }) => key)][0]}`;
    });
    const doubles = keys.filter((key, index) => keys.indexOf(key) !== index);
    expect(doubles).toEqual([]);
  });

  it("refuse un fichier absent, en nommant son chemin", () => {
    expect(() => getInsults(join(tmpdir(), "insults-absent", "insults.txt"))).toThrow("introuvable");
  });

  it("refuse un fichier sans aucune entrée", () => {
    expect(() => getInsults(createFile("# seulement un commentaire\n\n"))).toThrow("aucune insulte");
  });
});

describe("la liste du dépôt trouve les insultes, même déguisées", () => {
  const list = getInsults(PATH);

  it.each([
    "connard",
    "c0nn4rd",
    "C O N N A R D",
    "connnnnnnard",
    "conard",
    "conasse",
    "poufiasse",
    "conne",
    "connnne",
    "t'es qu'une conne",
    "N1GG3R",
    "niiigger",
    "conn@rd",
    "quelle connasse",
    "sale pute",
    "espèce de s@l0p3",
    "t'es qu'un enculé",
    "enculééé",
    "3ncul3",
    "ferme ta gueule",
    "TA GUEULE",
    "tg",
    "ftg",
    "fdp",
    "ntm",
    "nique ta mère",
    "N1QU3 T4 M3R3",
    "va te faire foutre",
    "fils de pute",
    "p.u.t.a.i.n",
    "putain de merde",
    "sale juif",
    "sale arabe",
    "s4l3 n0ir",
    "sale pd",
    "pd",
    "sale nègre",
    "heil hitler",
    "sieg heil",
    "mort aux juifs",
    "bamboula",
    "youpin",
    "tafiole",
    "tarlouze",
    "gouine",
    "kys",
    "kill yourself",
    "va te suicider",
    "tue toi",
    "je vais te tuer",
    "mongolien",
    "retourne à la cuisine",
    "nigger",
    "faggot",
    "fuck you",
    "motherfucker",
    "sale bougnoule",
    "pédophile",
    "retourne dans ton pays",
    "trou du cul",
    "gros porc",
    "crétin",
    "abruti",
  ])("trouve : %s", (text) => {
    expect(toInsultMatch(text, list), text).not.toBeNull();
  });
});

// Des phrases de tchat ordinaires, avec les mots piégeux : la liste ne doit en ignorer aucune. Une phrase de plus ici à chaque
// faux positif vu dans le journal du serveur.
describe("la liste du dépôt laisse passer les phrases ordinaires", () => {
  const list = getInsults(PATH);

  it.each([
    "Salut tout le monde, ça va ?",
    "Bonne chance pour le boss !",
    "On fait un pique-nique ce week-end",
    "la technique de ce joueur est incroyable",
    "c'est unique comme jeu",
    "Dominique est là aussi",
    "Véronique adore ce stream",
    "le concert était génial",
    "un conducteur prudent",
    "la console est branchée",
    "le contrôle technique est passé",
    "un cône de signalisation",
    "j'ai confiance en toi",
    "mon compagnon de jeu",
    "la classe moyenne",
    "un second essai",
    "il est assis par terre",
    "une cassette audio",
    "un tournoi de pétanque",
    "une salade de fruits",
    "la salle des fêtes",
    "c'est sale dans la cuisine",
    "je suis crevé ce soir",
    "un fromage râpé",
    "la Mongolie est grande",
    "l'empire mongol",
    "une dispute entre amis",
    "j'ai un nouvel ordinateur",
    "la réputation du streamer",
    "Mario porte une salopette bleue",
    "Putin et Zelensky à la télé",
    "il s'est attardé sur le parking",
    "une pédale de vélo",
    "des pédales de frein",
    "le Nigeria est un grand pays",
    "Niger",
    "le Niger est un pays d'Afrique",
    "la capitale du Niger s'appelle Niamey",
    "un cône orange",
    "cône",
    "un fagot de bois",
    "Hitler et la seconde guerre mondiale",
    "un cours d'histoire sur le nazisme",
    "mort de rire",
    "je meurs de faim",
    "le boss est mort",
    "tu vas mourir dans ce niveau",
    "le héros va gagner",
    "pique-nique en famille",
    "un fichier pdf",
    "le tgv de 14h",
    "ce streamer est un génie",
    "quelle belle partie",
    "on se retrouve demain pour la suite",
    "mon chat est mignon",
    "le concours de pêche",
    "un contrat de travail",
    "contre toute attente",
    "il connaît la réponse",
    "les consoles de nouvelle génération",
    "la connexion est lente",
    "ce jeu est nul mais j'adore",
    "tu es nul, mais gentil",
    "bravo pour la victoire",
    "à quelle heure le live demain ?",
    "mdr trop drôle",
    "ptdr la chute",
    "gg wp",
    "t'es un champion",
    "j'ai pas compris le puzzle",
    "il faut tuer le dragon avec l'épée",
    "tu peux le tuer avec une flèche",
    "la bite d'amarrage du bateau",
    "un bon repas avec des pâtes",
    "c'est la fête à la maison",
    "Dunkerque et Calais",
    "Cassandre et Pétrus",
    "Scunthorpe est une ville anglaise",
    "the english class assassin",
    "j'ai passé un excellent moment",
    "la grande roue du parc",
    "ce n'est pas une insulte",
    "les consommateurs sont contents",
    "le moniteur de ski",
    "un bon pétard pour le feu d'artifice",
    "le matériel est excellent",
    "ça pique un peu mais ça passe",
    "mon pote est trop fort",
    "on se refait une partie ?",
  ])("laisse passer : %s", (text) => {
    expect(toInsultMatch(text, list), text).toBeNull();
  });
});
