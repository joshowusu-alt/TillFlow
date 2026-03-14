import bwipjs from 'bwip-js/node';

export type BarcodeFormat = 'ean13' | 'code128' | 'qrcode';

export interface BarcodeOptions {
  value: string;
  format: BarcodeFormat;
  width?: number;
  height?: number;
  includeText?: boolean;
}

const DEFAULT_BARCODE_OPTIONS = {
  ean13: {
    scale: 3,
    height: 10,
  },
  code128: {
    scale: 3,
    height: 10,
  },
  qrcode: {
    scale: 3,
    width: 25,
    height: 25,
  },
} as const;

function withOptionalWidth<T extends Record<string, unknown>>(config: T, width: number | undefined): T {
  if (width === undefined) {
    return config;
  }

  return {
    ...config,
    width,
  };
}

function assertPositiveDimension(value: number | undefined, name: string) {
  if (value === undefined) {
    return;
  }

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number in millimeters.`);
  }
}

function calculateEan13CheckDigit(value: string): string {
  const digits = value
    .slice(0, 12)
    .split('')
    .map((digit) => Number(digit));

  const checksum = digits.reduce((sum, digit, index) => {
    return sum + digit * (index % 2 === 0 ? 1 : 3);
  }, 0);

  return String((10 - (checksum % 10)) % 10);
}

function normalizeBarcodeValue(value: string, format: BarcodeFormat): string {
  const trimmedValue = value.trim();
  const validation = validateBarcodeValue(trimmedValue, format);

  if (!validation.valid) {
    throw new Error(`Invalid ${format.toUpperCase()} barcode value: ${validation.error}`);
  }

  if (format === 'ean13' && trimmedValue.length === 12) {
    return `${trimmedValue}${calculateEan13CheckDigit(trimmedValue)}`;
  }

  return trimmedValue;
}

/**
 * Generate a barcode as a PNG buffer.
 * Works server-side (Node.js).
 */
export async function generateBarcodePng(options: BarcodeOptions): Promise<Buffer> {
  assertPositiveDimension(options.width, 'Barcode width');
  assertPositiveDimension(options.height, 'Barcode height');

  const value = normalizeBarcodeValue(options.value, options.format);
  const includeText = options.includeText ?? true;

  try {
    switch (options.format) {
      case 'ean13':
        return await bwipjs.toBuffer(withOptionalWidth({
          bcid: 'ean13',
          text: value,
          scale: DEFAULT_BARCODE_OPTIONS.ean13.scale,
          height: options.height ?? DEFAULT_BARCODE_OPTIONS.ean13.height,
          includetext: includeText,
        }, options.width));
      case 'code128':
        return await bwipjs.toBuffer(withOptionalWidth({
          bcid: 'code128',
          text: value,
          scale: DEFAULT_BARCODE_OPTIONS.code128.scale,
          height: options.height ?? DEFAULT_BARCODE_OPTIONS.code128.height,
          includetext: includeText,
        }, options.width));
      case 'qrcode':
        return await bwipjs.toBuffer({
          bcid: 'qrcode',
          text: value,
          scale: DEFAULT_BARCODE_OPTIONS.qrcode.scale,
          width: options.width ?? DEFAULT_BARCODE_OPTIONS.qrcode.width,
          height: options.height ?? DEFAULT_BARCODE_OPTIONS.qrcode.height,
          includetext: includeText,
        });
      default: {
        const exhaustiveCheck: never = options.format;
        throw new Error(`Unsupported barcode format: ${exhaustiveCheck}`);
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to generate ${options.format.toUpperCase()} barcode: ${error.message}`);
    }

    throw new Error(`Failed to generate ${options.format.toUpperCase()} barcode.`);
  }
}

/**
 * Generate a barcode as a base64-encoded PNG data URL.
 * Useful for embedding in HTML labels.
 */
export async function generateBarcodeDataUrl(options: BarcodeOptions): Promise<string> {
  const buffer = await generateBarcodePng(options);
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

/**
 * Validate a barcode value for a given format.
 * EAN-13: exactly 13 digits (or 12 + auto check digit)
 * Code-128: any ASCII string
 * QR: any string
 */
export function validateBarcodeValue(
  value: string,
  format: BarcodeFormat,
): { valid: boolean; error?: string } {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return { valid: false, error: 'Barcode value cannot be empty.' };
  }

  switch (format) {
    case 'ean13': {
      if (!/^\d+$/.test(trimmedValue)) {
        return { valid: false, error: 'EAN-13 values must contain digits only.' };
      }

      if (trimmedValue.length !== 12 && trimmedValue.length !== 13) {
        return {
          valid: false,
          error: 'EAN-13 values must be 12 digits (auto check digit) or 13 digits.',
        };
      }

      if (trimmedValue.length === 13) {
        const expectedCheckDigit = calculateEan13CheckDigit(trimmedValue);
        if (trimmedValue[12] !== expectedCheckDigit) {
          return {
            valid: false,
            error: `EAN-13 check digit is invalid. Expected ${expectedCheckDigit}.`,
          };
        }
      }

      return { valid: true };
    }
    case 'code128':
      if (!/^[\x00-\x7F]+$/.test(trimmedValue)) {
        return { valid: false, error: 'Code 128 values must contain ASCII characters only.' };
      }

      return { valid: true };
    case 'qrcode':
      return { valid: true };
    default: {
      const exhaustiveCheck: never = format;
      return { valid: false, error: `Unsupported barcode format: ${exhaustiveCheck}` };
    }
  }
}
