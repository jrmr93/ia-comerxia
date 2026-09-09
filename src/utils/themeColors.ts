import { StoreTheme } from '../types.ts';

export interface ThemeColorPalette {
  c0: string; // Color 1: Primary Brand / CTA / Main Accents
  c1: string; // Color 2: Secondary / Complementary Accent / Gradients
  c2: string; // Color 3: Surface / Card Background
  c3: string; // Color 4: Canvas / Global App Background
  c0Text: string;
  c1Text: string;
  c2Text: string;
  c3Text: string;
  c0Rgba: (alpha: number) => string;
  c1Rgba: (alpha: number) => string;
  c2Rgba: (alpha: number) => string;
  c3Rgba: (alpha: number) => string;
  isDark: boolean;
}

export const DEFAULT_THEME_COLORS: Record<StoreTheme, string[]> = {
  classic: ['#0284c7', '#2563eb', '#10b981', '#f8fafc'],
  boutique: ['#f59e0b', '#eab308', '#27272a', '#09090b'],
  fresh: ['#059669', '#0d9488', '#06b6d4', '#ecfdf5'],
  brutalist: ['#fde047', '#fb7185', '#34d399', '#000000'],
  cyber: ['#06b6d4', '#d946ef', '#0b1528', '#070d18'],
  minimal: ['#1c1917', '#78716c', '#e7e5e4', '#faf8f5'],
};

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  if (!hex || typeof hex !== 'string') return { r: 14, g: 165, b: 233 };
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  if (clean.length !== 6) {
    return { r: 14, g: 165, b: 233 };
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) return { r: 14, g: 165, b: 233 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function getContrastColor(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 135 ? '#09090b' : '#ffffff';
}

export function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function isDarkColor(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq < 128;
}

export function parseThemePalettes(raw: any): Record<string, string[]> {
  const result: Record<string, string[]> = {
    classic: [...DEFAULT_THEME_COLORS.classic],
    boutique: [...DEFAULT_THEME_COLORS.boutique],
    fresh: [...DEFAULT_THEME_COLORS.fresh],
    brutalist: [...DEFAULT_THEME_COLORS.brutalist],
    cyber: [...DEFAULT_THEME_COLORS.cyber],
    minimal: [...DEFAULT_THEME_COLORS.minimal],
  };

  if (!raw) return result;
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return result;
    }
  }

  if (typeof parsed === 'object' && parsed !== null) {
    Object.keys(result).forEach((key) => {
      if (Array.isArray(parsed[key]) && parsed[key].length >= 4) {
        result[key] = [...parsed[key]];
      }
    });
  }

  return result;
}

export function getThemeColors(palette?: string[], theme: StoreTheme = 'classic'): ThemeColorPalette {
  const defaults = DEFAULT_THEME_COLORS[theme] || DEFAULT_THEME_COLORS.classic;
  const p0 = palette?.[0] || defaults[0];
  const p1 = palette?.[1] || defaults[1];
  const p2 = palette?.[2] || defaults[2];
  const p3 = palette?.[3] || defaults[3];

  const dark = isDarkColor(p3) || theme === 'boutique' || theme === 'cyber';

  return {
    c0: p0,
    c1: p1,
    c2: p2,
    c3: p3,
    c0Text: getContrastColor(p0),
    c1Text: getContrastColor(p1),
    c2Text: getContrastColor(p2),
    c3Text: getContrastColor(p3),
    c0Rgba: (a: number) => hexToRgba(p0, a),
    c1Rgba: (a: number) => hexToRgba(p1, a),
    c2Rgba: (a: number) => hexToRgba(p2, a),
    c3Rgba: (a: number) => hexToRgba(p3, a),
    isDark: dark,
  };
}
