// La géométrie du vumètre : où tombe un level, et où se posent les repères des réglages.

// Le vumètre va de -60 dB (le silence de la pièce) à 0 dB (la pleine échelle) ; sous -60, la barre est vide.
const METER_FLOOR = -60;
const METER_CEILING = 0;

export const toMeterPosition = (level: number): number =>
  Math.min(1, Math.max(0, (level - METER_FLOOR) / (METER_CEILING - METER_FLOOR)));

export type MeterMark = {
  id: "threshold" | "quiet" | "loud";
  label: string;
  level: number;
  position: number;
};

type MeterLevels = { threshold: number; quietLevel?: number | undefined; loudLevel?: number | undefined };

// Les repères : le seuil, le niveau doux (s'il en a un, et si ce n'est pas le seuil lui-même), le niveau fort.
export const toMeterMarks = ({ threshold, quietLevel, loudLevel }: MeterLevels): MeterMark[] => {
  const marks: MeterMark[] = [
    { id: "threshold", label: "Seuil", level: threshold, position: toMeterPosition(threshold) },
  ];
  if (quietLevel !== undefined && quietLevel !== threshold) {
    marks.push({ id: "quiet", label: "Doux", level: quietLevel, position: toMeterPosition(quietLevel) });
  }
  if (loudLevel !== undefined) {
    marks.push({ id: "loud", label: "Fort", level: loudLevel, position: toMeterPosition(loudLevel) });
  }
  return marks;
};

export type MeterTone = "silent" | "talking" | "loud";

// La couleur de la barre : grise sous le seuil (la tête se tait), verte au-dessus, orange à partir du niveau fort.
export const toMeterTone = (level: number, { threshold, loudLevel }: MeterLevels): MeterTone => {
  if (level <= threshold) return "silent";
  return loudLevel !== undefined && level >= loudLevel ? "loud" : "talking";
};
