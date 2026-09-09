/**
 * Ecuador (+593) Phone Number Normalizer & Formatter
 * 
 * Supports both standard local format (0983302390) and international format (+593983302390).
 * Handles all common variations entered by Ecuadorian customers and merchants:
 *  - "+593983302390" -> local "0983302390", WhatsApp "593983302390"
 *  - "0983302390"    -> local "0983302390", WhatsApp "593983302390"
 *  - "983302390"     -> local "0983302390", WhatsApp "593983302390"
 *  - "593983302390"  -> local "0983302390", WhatsApp "593983302390"
 *  - "5930983302390" -> local "0983302390", WhatsApp "593983302390"
 *  - "+593 9 8330-2390" -> local "0983302390", WhatsApp "593983302390"
 */

export interface NormalizedPhone {
  /** Local 10-digit format used in Ecuador (e.g., "0983302390") */
  local: string;
  /** Formatted local string with spacing for clean reading (e.g., "098 330 2390") */
  formattedLocal: string;
  /** Formatted alias */
  formatted?: string;
  /** International format with plus symbol (e.g., "+593983302390") */
  international: string;
  /** International format formatted alias */
  formattedInternational?: string;
  /** E164 format alias */
  e164?: string;
  /** Digits alias */
  digits?: string;
  /** Pure digits for WhatsApp direct links (e.g., "593983302390") */
  whatsappDigits: string;
  /** Clean human display (e.g., "0983302390 / +593983302390") */
  displaySummary: string;
  /** Whether the phone matches a valid Ecuador mobile/fixed structure */
  isValid: boolean;
}

export function normalizeEcuadorPhone(input: string | null | undefined): NormalizedPhone {
  if (!input) {
    return {
      local: '',
      formattedLocal: '',
      formatted: '',
      international: '',
      formattedInternational: '',
      e164: '',
      digits: '',
      whatsappDigits: '',
      displaySummary: '',
      isValid: false,
    };
  }

  // Remove any non-digit character
  let clean = String(input).replace(/[^\d]/g, '');

  if (!clean) {
    return {
      local: '',
      formattedLocal: '',
      formatted: '',
      international: '',
      formattedInternational: '',
      e164: '',
      digits: '',
      whatsappDigits: '',
      displaySummary: '',
      isValid: false,
    };
  }

  // Handle accidental double prefix like "59309..."
  if (clean.startsWith('5930')) {
    clean = '593' + clean.slice(4);
  }

  let local = '';
  let whatsappDigits = '';

  // Case 1: Starts with country code 593 (e.g., "593983302390" -> 12 digits)
  if (clean.startsWith('593')) {
    const afterCode = clean.slice(3); // e.g. "983302390"
    if (afterCode.startsWith('9')) {
      local = '0' + afterCode; // "0983302390"
      whatsappDigits = '593' + afterCode; // "593983302390"
    } else {
      local = '0' + afterCode;
      whatsappDigits = '593' + afterCode;
    }
  }
  // Case 2: Starts with 0 (e.g., "0983302390" -> 10 digits)
  else if (clean.startsWith('0')) {
    const withoutZero = clean.slice(1); // "983302390"
    local = clean; // "0983302390"
    whatsappDigits = '593' + withoutZero; // "593983302390"
  }
  // Case 3: 9 digits starting with 9 (e.g., "983302390")
  else if (clean.startsWith('9') && clean.length === 9) {
    local = '0' + clean; // "0983302390"
    whatsappDigits = '593' + clean; // "593983302390"
  }
  // Case 4: Any other general digits
  else {
    if (clean.length === 8 || clean.length === 9) {
      local = '0' + clean;
      whatsappDigits = '593' + clean;
    } else {
      local = clean;
      whatsappDigits = clean.startsWith('593') ? clean : '593' + clean;
    }
  }

  const formattedLocal = formatEcuadorLocalDisplay(local);
  const international = '+' + whatsappDigits;
  const isValid = local.length >= 9 && local.length <= 11;
  const displaySummary = `${local} (+${whatsappDigits})`;

  return {
    local,
    formattedLocal,
    formatted: formattedLocal,
    international,
    formattedInternational: international,
    e164: international,
    digits: clean,
    whatsappDigits,
    displaySummary,
    isValid,
  };
}

/**
 * Formats a local Ecuadorian mobile number into "098 330 2390"
 */
export function formatEcuadorLocalDisplay(localNumber: string): string {
  if (!localNumber) return '';
  const digits = localNumber.replace(/[^\d]/g, '');
  if (digits.length === 10 && digits.startsWith('09')) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  return localNumber;
}

/**
 * Returns clean 10-digit Ecuadorian local number: "0983302390"
 */
export function toEcuadorLocalPhone(input: string | null | undefined): string {
  return normalizeEcuadorPhone(input).local;
}

/**
 * Returns digits for WhatsApp wa.me links: "593983302390"
 */
export function toEcuadorWhatsAppDigits(input: string | null | undefined): string {
  return normalizeEcuadorPhone(input).whatsappDigits;
}

/**
 * Returns international string with '+': "+593983302390"
 */
export function toEcuadorInternationalPhone(input: string | null | undefined): string {
  return normalizeEcuadorPhone(input).international;
}

/**
 * Creates a verified direct WhatsApp chat link with UTF-8 support
 */
export function buildWhatsAppLink(phoneNumber: string | null | undefined, message?: string): string {
  const norm = normalizeEcuadorPhone(phoneNumber);
  const digits = norm.whatsappDigits;
  const encodedText = message ? encodeURIComponent(message) : '';

  if (!digits) {
    return encodedText
      ? `https://api.whatsapp.com/send?text=${encodedText}`
      : 'https://api.whatsapp.com';
  }

  return encodedText
    ? `https://api.whatsapp.com/send?phone=${digits}&text=${encodedText}`
    : `https://api.whatsapp.com/send?phone=${digits}`;
}

/**
 * Checks if a payment method string corresponds to Cash / Pago contraentrega
 */
export function isCashPayment(methodStr: string | null | undefined): boolean {
  if (!methodStr) return false;
  const m = methodStr.toLowerCase().trim();
  return (
    m.includes('efectivo') ||
    m.includes('contraentrega') ||
    m.includes('cash') ||
    m.includes('entrega') ||
    m === 'efectivo' ||
    m === 'contraentrega'
  );
}

