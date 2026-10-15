// Le cooldown global d'un son, dit en une ligne : « sans cooldown », ou « cooldown 30 s » (0 s : aucun).
export const toPaceText = (pace: number): string => (pace === 0 ? "sans cooldown" : `cooldown ${pace} s`);
