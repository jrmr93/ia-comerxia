// Smart currency and number formatting utility to prevent clipping and ellipses on large metrics

/**
 * Returns exact currency formatted string for tooltips / full views
 */
export const formatExactCurrency = (val: number, currency: string = 'USD'): string => {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 2,
  }).format(val || 0);
};

/**
 * Returns smart display currency:
 * - If value is >= 1,000,000: formats as $X.XXM (e.g., $1.45M USD)
 * - If value is >= 100,000: formats as $XXX.XK (e.g., $125.4K USD)
 * - Otherwise: standard 2-decimal localized currency (e.g., $12,450.00 USD)
 */
export const formatSmartCurrency = (val: number, currency: string = 'USD'): string => {
  const absVal = Math.abs(val || 0);
  const sign = val < 0 ? '-' : '';

  if (absVal >= 1_000_000) {
    const millions = absVal / 1_000_000;
    return `${sign}$${millions >= 10 ? millions.toFixed(1) : millions.toFixed(2)}M`;
  }

  if (absVal >= 100_000) {
    const thousands = absVal / 1_000;
    return `${sign}$${thousands >= 100 ? Math.round(thousands) : thousands.toFixed(1)}K`;
  }

  return formatExactCurrency(val, currency);
};

/**
 * Returns dynamic font size class depending on formatted string length
 */
export const getMetricFontSizeClass = (text: string): string => {
  const len = text.length;
  if (len > 13) return 'text-sm sm:text-base font-black tracking-tighter';
  if (len > 10) return 'text-base sm:text-lg font-black tracking-tight';
  if (len > 7) return 'text-lg sm:text-xl font-black tracking-tight';
  return 'text-xl sm:text-2xl font-black tracking-tight';
};
