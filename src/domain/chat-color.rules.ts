// Le fond sur lequel on juge un pseudo : la surface des pills en apparence sombre (--pill-surface, tokens.css). Un texte seul
// a une ombre sombre derrière lui, et le fond réel de la scène est inconnu : la pill reste la référence la plus sûre.
export const CHAT_SURFACE = "#181a24";

// WCAG AA pour un texte courant.
const MIN_CONTRAST = 4.5;
const LIGHTEN_STEP = 0.02;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

type Rgb = [number, number, number];
type Hsl = [number, number, number];

export const isChatColor = (color: string | null): color is string =>
  color !== null && COLOR_PATTERN.test(color);

const toChannel = (color: string, from: number): number =>
  Number.parseInt(color.slice(from, from + 2), 16) / 255;

const toRgb = (color: string): Rgb => [toChannel(color, 1), toChannel(color, 3), toChannel(color, 5)];

const toLinear = (channel: number): number =>
  channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

const toLuminance = (color: string): number => {
  const [red, green, blue] = toRgb(color);
  return 0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue);
};

// Le rapport de contraste WCAG entre deux couleurs #RRGGBB : de 1 (identiques) à 21 (noir sur blanc).
export const toContrast = (foreground: string, background: string): number => {
  const first = toLuminance(foreground);
  const second = toLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
};

const toHsl = ([red, green, blue]: Rgb): Hsl => {
  const high = Math.max(red, green, blue);
  const low = Math.min(red, green, blue);
  const lightness = (high + low) / 2;
  if (high === low) return [0, 0, lightness];
  const spread = high - low;
  const saturation = lightness > 0.5 ? spread / (2 - high - low) : spread / (high + low);
  if (high === red) return [((green - blue) / spread + (green < blue ? 6 : 0)) / 6, saturation, lightness];
  if (high === green) return [((blue - red) / spread + 2) / 6, saturation, lightness];
  return [((red - green) / spread + 4) / 6, saturation, lightness];
};

const toHueChannel = (low: number, high: number, turn: number): number => {
  const hue = (turn + 1) % 1;
  if (hue < 1 / 6) return low + (high - low) * 6 * hue;
  if (hue < 1 / 2) return high;
  if (hue < 2 / 3) return low + (high - low) * (2 / 3 - hue) * 6;
  return low;
};

const fromHsl = ([hue, saturation, lightness]: Hsl): Rgb => {
  if (saturation === 0) return [lightness, lightness, lightness];
  const high =
    lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const low = 2 * lightness - high;
  return [
    toHueChannel(low, high, hue + 1 / 3),
    toHueChannel(low, high, hue),
    toHueChannel(low, high, hue - 1 / 3),
  ];
};

const toHex = ([red, green, blue]: Rgb): string =>
  `#${[red, green, blue]
    .map((channel) =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

// La couleur du nickname telle que la page l'affiche : celle du viewer si elle se lit sur le fond, sinon la même teinte
// éclaircie juste assez. `null` : le viewer n'en a pas, la page prend la couleur par défaut.
export const toReadableColor = (color: string | null): string | null => {
  if (!isChatColor(color)) return null;
  if (toContrast(color, CHAT_SURFACE) >= MIN_CONTRAST) return color;
  const [hue, saturation, lightness] = toHsl(toRgb(color));
  for (let lighter = lightness + LIGHTEN_STEP; lighter < 1; lighter += LIGHTEN_STEP) {
    const candidate = toHex(fromHsl([hue, saturation, lighter]));
    if (toContrast(candidate, CHAT_SURFACE) >= MIN_CONTRAST) return candidate;
  }
  return "#ffffff";
};
