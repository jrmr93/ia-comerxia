/**
 * Validador Oficial de Cédula de Identidad y RUC de la República del Ecuador
 * 
 * Reglas de Validación:
 * 1. Cédula de Identidad (10 dígitos numéricos):
 *    - Longitud exacta de 10 dígitos.
 *    - Los primeros dos dígitos corresponden a la provincia (01 al 24 o 30 para el exterior).
 *    - El tercer dígito debe ser menor a 6 (0 al 5) para personas naturales.
 *    - Algoritmo Módulo 10 (coeficientes [2, 1, 2, 1, 2, 1, 2, 1, 2]):
 *      Multiplicación de cada dígito por su coeficiente. Si es >= 10, se resta 9.
 *      La suma se contrasta contra el décimo dígito verificador.
 * 
 * 2. RUC Persona Natural (13 dígitos):
 *    - Los primeros 10 dígitos deben formar una cédula ecuatoriana válida.
 *    - Los últimos 3 dígitos corresponden al establecimiento (001 a 999).
 * 
 * 3. RUC Sociedad Privada (13 dígitos):
 *    - Tercer dígito igual a 9. Módulo 11 en las primeras 9 posiciones, termina en 001-999.
 * 
 * 4. RUC Entidad Pública (13 dígitos):
 *    - Tercer dígito igual a 6. Módulo 11 en las primeras 8 posiciones, termina en 0001-9999.
 */

export const ECUADOR_PROVINCES: Record<string, string> = {
  '01': 'Azuay',
  '02': 'Bolívar',
  '03': 'Cañar',
  '04': 'Carchi',
  '05': 'Cotopaxi',
  '06': 'Chimborazo',
  '07': 'El Oro',
  '08': 'Esmeraldas',
  '09': 'Guayas',
  '10': 'Imbabura',
  '11': 'Loja',
  '12': 'Los Ríos',
  '13': 'Manabí',
  '14': 'Morona Santiago',
  '15': 'Napo',
  '16': 'Pastaza',
  '17': 'Pichincha',
  '18': 'Tungurahua',
  '19': 'Zamora Chinchipe',
  '20': 'Galápagos',
  '21': 'Sucumbíos',
  '22': 'Orellana',
  '23': 'Santo Domingo de los Tsáchilas',
  '24': 'Santa Elena',
  '30': 'Exterior / Consulado',
};

export interface EcuadorIdValidationResult {
  isValid: boolean;
  type: 'cedula' | 'ruc_natural' | 'ruc_privada' | 'ruc_publica' | 'invalid';
  cleaned: string;
  formatted: string;
  provinceCode?: string;
  provinceName?: string;
  error?: string;
}

/**
 * Valida un número de Cédula o RUC de Ecuador
 * @param id Número de cédula o RUC a verificar
 * @param allowRuc Si se permite RUC (13 dígitos). Por defecto true.
 */
export function validateEcuadorId(
  id: string | null | undefined,
  allowRuc: boolean = true
): EcuadorIdValidationResult {
  if (!id) {
    return {
      isValid: false,
      type: 'invalid',
      cleaned: '',
      formatted: '',
      error: 'El número de cédula es obligatorio',
    };
  }

  // Eliminar espacios, guiones y cualquier carácter no numérico
  const cleaned = String(id).replace(/\D/g, '').trim();

  if (cleaned.length === 0) {
    return {
      isValid: false,
      type: 'invalid',
      cleaned: '',
      formatted: '',
      error: 'El número de cédula debe contener dígitos numéricos',
    };
  }

  // Validación de longitud
  if (cleaned.length !== 10 && cleaned.length !== 13) {
    if (cleaned.length < 10) {
      return {
        isValid: false,
        type: 'invalid',
        cleaned,
        formatted: cleaned,
        error: `La cédula ecuatoriana debe tener 10 dígitos (actualmente tiene ${cleaned.length})`,
      };
    }
    return {
      isValid: false,
      type: 'invalid',
      cleaned,
      formatted: cleaned,
      error: `Longitud inválida: debe tener 10 dígitos para cédula${allowRuc ? ' o 13 para RUC' : ''} (tiene ${cleaned.length})`,
    };
  }

  if (cleaned.length === 13 && !allowRuc) {
    return {
      isValid: false,
      type: 'invalid',
      cleaned,
      formatted: cleaned,
      error: 'Se requiere una cédula de 10 dígitos (no RUC de 13 dígitos)',
    };
  }

  // Comprobar código de provincia (primeros 2 dígitos)
  const provCode = cleaned.substring(0, 2);
  const provNum = parseInt(provCode, 10);
  const isValidProv = (provNum >= 1 && provNum <= 24) || provNum === 30;

  if (!isValidProv) {
    return {
      isValid: false,
      type: 'invalid',
      cleaned,
      formatted: cleaned,
      error: `Código de provincia "${provCode}" inválido. En Ecuador debe ser entre 01 y 24 (o 30 en el exterior)`,
    };
  }

  const provinceName = ECUADOR_PROVINCES[provCode] || 'Provincia no identificada';
  const thirdDigit = parseInt(cleaned.charAt(2), 10);

  // -------------------------------------------------------------
  // CASO 1: Cédula de Identidad de 10 dígitos
  // -------------------------------------------------------------
  if (cleaned.length === 10) {
    if (thirdDigit >= 6) {
      return {
        isValid: false,
        type: 'invalid',
        cleaned,
        formatted: cleaned,
        provinceCode: provCode,
        provinceName,
        error: `El tercer dígito de una cédula debe ser menor a 6 (entre 0 y 5). El valor ingresado es ${thirdDigit}.`,
      };
    }

    // Algoritmo Módulo 10 para Cédula Ecuatoriana
    const coefficients = [2, 1, 2, 1, 2, 1, 2, 1, 2];
    let sum = 0;

    for (let i = 0; i < 9; i++) {
      const digit = parseInt(cleaned.charAt(i), 10);
      let product = digit * coefficients[i];
      if (product >= 10) {
        product -= 9;
      }
      sum += product;
    }

    const verifierDigit = parseInt(cleaned.charAt(9), 10);
    const calculatedVerifier = sum % 10 === 0 ? 0 : 10 - (sum % 10);

    if (calculatedVerifier !== verifierDigit) {
      return {
        isValid: false,
        type: 'invalid',
        cleaned,
        formatted: cleaned,
        provinceCode: provCode,
        provinceName,
        error: `Dígito verificador incorrecto. La cédula "${cleaned}" no es válida según el Registro Civil del Ecuador.`,
      };
    }

    return {
      isValid: true,
      type: 'cedula',
      cleaned,
      formatted: `${cleaned.substring(0, 9)}-${cleaned.charAt(9)}`,
      provinceCode: provCode,
      provinceName,
    };
  }

  // -------------------------------------------------------------
  // CASO 2: RUC de 13 dígitos
  // -------------------------------------------------------------
  if (cleaned.length === 13) {
    // 2A: RUC Persona Natural (tercer dígito < 6)
    if (thirdDigit < 6) {
      const cedulaPart = cleaned.substring(0, 10);
      const cedulaCheck = validateEcuadorId(cedulaPart, false);

      if (!cedulaCheck.isValid) {
        return {
          isValid: false,
          type: 'invalid',
          cleaned,
          formatted: cleaned,
          provinceCode: provCode,
          provinceName,
          error: `RUC de persona natural inválido: ${cedulaCheck.error}`,
        };
      }

      const branchCode = cleaned.substring(10, 13);
      if (branchCode === '000') {
        return {
          isValid: false,
          type: 'invalid',
          cleaned,
          formatted: cleaned,
          provinceCode: provCode,
          provinceName,
          error: 'El código de establecimiento del RUC no puede ser 000 (normalmente 001)',
        };
      }

      return {
        isValid: true,
        type: 'ruc_natural',
        cleaned,
        formatted: `${cleaned.substring(0, 10)}-${branchCode}`,
        provinceCode: provCode,
        provinceName,
      };
    }

    // 2B: RUC Sociedad Privada o Extranjeros (tercer dígito = 9)
    if (thirdDigit === 9) {
      const coefficients = [4, 3, 2, 7, 6, 5, 4, 3, 2];
      let sum = 0;
      for (let i = 0; i < 9; i++) {
        sum += parseInt(cleaned.charAt(i), 10) * coefficients[i];
      }
      const residue = sum % 11;
      const expectedVerifier = residue === 0 ? 0 : 11 - residue;
      const verifierDigit = parseInt(cleaned.charAt(9), 10);

      if (expectedVerifier !== verifierDigit) {
        return {
          isValid: false,
          type: 'invalid',
          cleaned,
          formatted: cleaned,
          provinceCode: provCode,
          provinceName,
          error: 'Dígito verificador de RUC privado inválido',
        };
      }

      const branchCode = cleaned.substring(10, 13);
      if (branchCode === '000') {
        return {
          isValid: false,
          type: 'invalid',
          cleaned,
          formatted: cleaned,
          error: 'El establecimiento del RUC debe ser al menos 001',
        };
      }

      return {
        isValid: true,
        type: 'ruc_privada',
        cleaned,
        formatted: `${cleaned.substring(0, 10)}-${branchCode}`,
        provinceCode: provCode,
        provinceName,
      };
    }

    // 2C: RUC Entidad Pública (tercer dígito = 6)
    if (thirdDigit === 6) {
      const coefficients = [3, 2, 7, 6, 5, 4, 3, 2];
      let sum = 0;
      for (let i = 0; i < 8; i++) {
        sum += parseInt(cleaned.charAt(i), 10) * coefficients[i];
      }
      const residue = sum % 11;
      const expectedVerifier = residue === 0 ? 0 : 11 - residue;
      const verifierDigit = parseInt(cleaned.charAt(8), 10);

      if (expectedVerifier !== verifierDigit) {
        return {
          isValid: false,
          type: 'invalid',
          cleaned,
          formatted: cleaned,
          provinceCode: provCode,
          provinceName,
          error: 'Dígito verificador de RUC público inválido',
        };
      }

      const branchCode = cleaned.substring(9, 13);
      if (branchCode === '0000') {
        return {
          isValid: false,
          type: 'invalid',
          cleaned,
          formatted: cleaned,
          error: 'El establecimiento del RUC público no puede ser 0000',
        };
      }

      return {
        isValid: true,
        type: 'ruc_publica',
        cleaned,
        formatted: `${cleaned.substring(0, 9)}-${branchCode}`,
        provinceCode: provCode,
        provinceName,
      };
    }

    return {
      isValid: false,
      type: 'invalid',
      cleaned,
      formatted: cleaned,
      error: `Tercer dígito de RUC (${thirdDigit}) no es válido para personas naturales ni sociedades`,
    };
  }

  return {
    isValid: false,
    type: 'invalid',
    cleaned,
    formatted: cleaned,
    error: 'Número de cédula o RUC ecuatoriano no válido',
  };
}

/**
 * Función rápida que retorna booleano si la cédula (o RUC) es válida
 */
export function isValidEcuadorId(id: string | null | undefined, allowRuc: boolean = true): boolean {
  return validateEcuadorId(id, allowRuc).isValid;
}

/**
 * Formatea una cédula ecuatoriana limpia o devuelve el valor original si no es válida
 */
export function formatEcuadorCedula(id: string | null | undefined): string {
  const res = validateEcuadorId(id, true);
  return res.isValid ? res.formatted : (id || '').trim();
}
