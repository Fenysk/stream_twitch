import { z } from "zod";

// Les emotes de 7TV, BTTV et FFZ ne sont pas dans les positions que Twitch donne : le renard les retire de ce qu'il lit
// d'après leurs noms. Chaque service a deux listes : les emotes globales, et celles de la chaîne.
export const EMOTE_PROVIDERS = ["7tv", "bttv", "ffz"] as const;
export type EmoteProvider = (typeof EMOTE_PROVIDERS)[number];

export const EMOTE_SCOPES = ["global", "channel"] as const;
export type EmoteScope = (typeof EMOTE_SCOPES)[number];

export const EMOTE_PROVIDER_LABELS: Record<EmoteProvider, string> = {
  "7tv": "7TV",
  bttv: "BTTV",
  ffz: "FFZ",
};

const NamesSchema = z.array(z.string().min(1));
const ScopesSchema = z.object({ global: NamesSchema, channel: NamesSchema });
export const EmoteListsSchema = z.object({ "7tv": ScopesSchema, bttv: ScopesSchema, ffz: ScopesSchema });
export type EmoteLists = z.infer<typeof EmoteListsSchema>;

// Ce que le serveur garde dans data/ entre deux démarrages : les dernières listes reçues, et quand.
export const StoredEmotesSchema = z.object({ savedAt: z.number(), lists: EmoteListsSchema });
export type StoredEmotes = z.infer<typeof StoredEmotesSchema>;

export const toEmptyLists = (): EmoteLists => ({
  "7tv": { global: [], channel: [] },
  bttv: { global: [], channel: [] },
  ffz: { global: [], channel: [] },
});

// Le cache s'écrit en texte, une ligne par liste (« 7tv global: EZ Clap »), et non en JSON : Biome formate les JSON de
// data/, et une liste écrite d'un trait n'a pas son formatage. Un nom d'emote n'a pas d'espace (le tchat se coupe aux espaces) :
// un nom avec un espace ne s'écrit pas, il ne serait de toute façon jamais reconnu.
export function toStoredText({ savedAt, lists }: StoredEmotes): string {
  const lines = [`savedAt: ${savedAt}`];
  for (const provider of EMOTE_PROVIDERS) {
    for (const scope of EMOTE_SCOPES) {
      const names = lists[provider][scope].filter((name) => !/\s/u.test(name));
      lines.push(`${provider} ${scope}: ${names.join(" ")}`.trimEnd());
    }
  }
  return `${lines.join("\n")}\n`;
}

// Les lignes « clé: valeur » du texte ; la clé perd ses espaces en trop, les lignes sans deux-points sont laissées.
const toEntries = (text: string): Map<string, string> => {
  const entries = new Map<string, string>();
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (const line of withoutBom.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    entries.set(line.slice(0, separator).trim().replace(/\s+/gu, " "), line.slice(separator + 1).trim());
  }
  return entries;
};

// L'inverse de toStoredText, ou `null` quand le texte n'est pas ce que le serveur écrit (une ligne manque, la date n'est pas
// un nombre).
export function toStoredEmotes(text: string): StoredEmotes | null {
  const entries = toEntries(text);
  const lists = toEmptyLists();
  for (const provider of EMOTE_PROVIDERS) {
    for (const scope of EMOTE_SCOPES) {
      const line = entries.get(`${provider} ${scope}`);
      if (line === undefined) return null;
      lists[provider][scope] = line === "" ? [] : line.split(/\s+/u);
    }
  }
  const parsed = StoredEmotesSchema.safeParse({ savedAt: Number(entries.get("savedAt")), lists });
  return parsed.success ? parsed.data : null;
}

// Les services écrivent `emote_set` et `default_sets` en snake_case : ces deux clés se lisent dans l'objet, sans être déclarées.
const ObjectSchema = z.record(z.string(), z.unknown());

// 7TV : un ensemble d'emotes (`emotes[].name`), global, ou celui de l'utilisateur (`emote_set`, absent s'il n'en a pas).
const SevenTvSetSchema = z.object({ emotes: z.array(z.object({ name: z.string().min(1) })).nullish() });

// BTTV : une liste de `code` pour les globales ; `channelEmotes` et `sharedEmotes` pour la chaîne.
const BetterTtvEmoteSchema = z.object({ code: z.string().min(1) });
const BetterTtvGlobalSchema = z.array(BetterTtvEmoteSchema);
const BetterTtvChannelSchema = z.object({
  channelEmotes: z.array(BetterTtvEmoteSchema).nullish(),
  sharedEmotes: z.array(BetterTtvEmoteSchema).nullish(),
});

// FFZ : des ensembles numérotés (`sets`) d'`emoticons[].name` ; les globales sont ceux de `default_sets`, la chaîne a les siens.
const FfzSetsSchema = z.record(
  z.string(),
  z.object({ emoticons: z.array(z.object({ name: z.string().min(1) })) }),
);
const FfzDefaultsSchema = z.array(z.number());

const toSevenTvSetNames = (json: unknown): string[] | null => {
  const parsed = SevenTvSetSchema.safeParse(json);
  return parsed.success ? (parsed.data.emotes ?? []).map(({ name }) => name) : null;
};

const toSevenTvNames = (scope: EmoteScope, json: unknown): string[] | null => {
  if (scope === "global") return toSevenTvSetNames(json);
  const user = ObjectSchema.safeParse(json);
  if (!user.success) return null;
  const set = user.data.emote_set;
  return set === undefined || set === null ? [] : toSevenTvSetNames(set);
};

const toBetterTtvNames = (scope: EmoteScope, json: unknown): string[] | null => {
  if (scope === "global") {
    const parsed = BetterTtvGlobalSchema.safeParse(json);
    return parsed.success ? parsed.data.map(({ code }) => code) : null;
  }
  const parsed = BetterTtvChannelSchema.safeParse(json);
  if (!parsed.success) return null;
  return [...(parsed.data.channelEmotes ?? []), ...(parsed.data.sharedEmotes ?? [])].map(({ code }) => code);
};

const toFfzNames = (scope: EmoteScope, json: unknown): string[] | null => {
  const answer = ObjectSchema.safeParse(json);
  if (!answer.success) return null;
  const sets = FfzSetsSchema.safeParse(answer.data.sets);
  if (!sets.success) return null;
  if (scope === "channel") {
    return Object.values(sets.data).flatMap(({ emoticons }) => emoticons.map(({ name }) => name));
  }
  const defaults = FfzDefaultsSchema.safeParse(answer.data.default_sets);
  if (!defaults.success) return null;
  return defaults.data.flatMap((id) => sets.data[String(id)]?.emoticons.map(({ name }) => name) ?? []);
};

// Les noms d'emotes d'une réponse d'un service, ou `null` quand elle n'a pas la forme attendue (le service a changé, ou ce
// n'est pas lui qui répond).
export function toEmoteNames(provider: EmoteProvider, scope: EmoteScope, json: unknown): string[] | null {
  switch (provider) {
    case "7tv":
      return toSevenTvNames(scope, json);
    case "bttv":
      return toBetterTtvNames(scope, json);
    case "ffz":
      return toFfzNames(scope, json);
  }
}

// Les noms de 7TV, BTTV et FFZ ensemble, puis ceux de `foxEmoteNames` (les ajouts à la main) : chacun une seule fois.
export function toKnownEmoteNames(lists: EmoteLists, manual: readonly string[]): string[] {
  const names = EMOTE_PROVIDERS.flatMap((provider) => [
    ...lists[provider].global,
    ...lists[provider].channel,
  ]);
  return [...new Set([...names, ...manual])];
}

// Le nombre d'emotes d'un service, globales et chaîne ensemble (un nom en double compte une fois).
export const toEmoteCount = (lists: EmoteLists, provider: EmoteProvider): number =>
  new Set([...lists[provider].global, ...lists[provider].channel]).size;
