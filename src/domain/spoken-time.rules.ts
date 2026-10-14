// Les heures et les durées telles que la synthèse vocale française les dit bien : « minuit », « midi », « 23 heures 30 »,
// « 1 heure 10 », « 20 minutes ».

// Une heure du jour : minuit et midi se disent par leur nom, les autres en heures (« 1 heure », « 23 heures »), suivies des
// minutes (« minuit 20 », « 23 heures 30 »).
export function toSpokenTime(hours: number, minutes: number): string {
  const base = hours === 0 ? "minuit" : hours === 12 ? "midi" : toSpokenHours(hours);
  return minutes === 0 ? base : `${base} ${minutes}`;
}

// « 1 heure », « 2 heures ».
export const toSpokenHours = (count: number): string => `${count} ${count === 1 ? "heure" : "heures"}`;

// Une durée en minutes : « 20 minutes », « 1 heure », « 1 heure 10 ».
export function toSpokenDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} ${minutes > 1 ? "minutes" : "minute"}`;
  return minutes === 0 ? toSpokenHours(hours) : `${toSpokenHours(hours)} ${minutes}`;
}

// L'heure du jour d'un instant (en ms), à l'heure locale du PC.
export function toSpokenClock(at: number): string {
  const date = new Date(at);
  return toSpokenTime(date.getHours(), date.getMinutes());
}

// Une phrase commence par une majuscule, même quand elle commence par une variable (« minuit. Le live est fini »).
export const toCapitalized = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
