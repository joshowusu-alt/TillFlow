/**
 * Bounded streaming CSV parser for migration validation (Slice 2B).
 * Does not load unbounded files into memory as a single string.
 */

import {
  MIGRATION_MAX_COLUMNS,
  MIGRATION_MAX_ROWS,
  MIGRATION_MAX_UPLOAD_BYTES,
} from '@/lib/migration/limits';

export const MIGRATION_MAX_HEADER_LENGTH = 128;
export const MIGRATION_MAX_FIELD_LENGTH = 500;

export type CsvParseIssue = {
  code:
    | 'MALFORMED_CSV'
    | 'MALFORMED_QUOTING'
    | 'TOO_MANY_COLUMNS'
    | 'TOO_MANY_ROWS'
    | 'FIELD_TOO_LONG'
    | 'HEADER_TOO_LONG'
    | 'ROW_WIDTH_MISMATCH'
    | 'EMPTY_FILE'
    | 'ENCODING_UNSUPPORTED';
  message: string;
  rowNumber: number | null;
};

export type CsvParseResult = {
  headers: string[];
  rows: string[][];
  /** 1-based data row numbers aligned with `rows`. */
  rowNumbers: number[];
  byteLength: number;
  sha256Hex: string;
  issues: CsvParseIssue[];
  blankRowCount: number;
};

async function* iterateBytes(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse a CSV ReadableStream with SHA-256, size, row, column and field ceilings.
 * Returns buffered row cells (bounded by contractual ceilings).
 */
export async function parseMigrationCsvStream(
  stream: ReadableStream<Uint8Array>,
  options: {
    maxBytes?: number;
    maxRows?: number;
    maxColumns?: number;
    maxFieldLength?: number;
    maxHeaderLength?: number;
  } = {},
): Promise<CsvParseResult> {
  const maxBytes = options.maxBytes ?? MIGRATION_MAX_UPLOAD_BYTES;
  const maxRows = options.maxRows ?? MIGRATION_MAX_ROWS;
  const maxColumns = options.maxColumns ?? MIGRATION_MAX_COLUMNS;
  const maxFieldLength = options.maxFieldLength ?? MIGRATION_MAX_FIELD_LENGTH;
  const maxHeaderLength = options.maxHeaderLength ?? MIGRATION_MAX_HEADER_LENGTH;

  const { createHash } = await import('crypto');
  const hash = createHash('sha256');
  const issues: CsvParseIssue[] = [];
  const rows: string[][] = [];
  const rowNumbers: number[] = [];
  let headers: string[] | null = null;
  let blankRowCount = 0;
  let byteLength = 0;

  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let lineNumber = 1;
  let sawCr = false;
  let physicalRowStart = 1;

  const pushIssue = (issue: CsvParseIssue) => {
    if (issues.length < 64) issues.push(issue);
  };

  const finishField = (isHeader: boolean) => {
    if (isHeader && field.length > maxHeaderLength) {
      pushIssue({
        code: 'HEADER_TOO_LONG',
        message: `Header exceeds ${maxHeaderLength} characters.`,
        rowNumber: 1,
      });
      field = field.slice(0, maxHeaderLength);
    } else if (!isHeader && field.length > maxFieldLength) {
      pushIssue({
        code: 'FIELD_TOO_LONG',
        message: `Field exceeds ${maxFieldLength} characters.`,
        rowNumber: lineNumber,
      });
      field = field.slice(0, maxFieldLength);
    }
    row.push(field);
    field = '';
  };

  const finishRow = () => {
    const isHeader = headers === null;
    if (inQuotes) {
      pushIssue({
        code: 'MALFORMED_QUOTING',
        message: 'Unterminated quoted field.',
        rowNumber: physicalRowStart,
      });
      inQuotes = false;
    }

    // Drop UTF-8 BOM from first header cell only.
    if (isHeader && row.length > 0 && row[0]!.charCodeAt(0) === 0xfeff) {
      row[0] = row[0]!.slice(1);
    }

    const allBlank = row.every((c) => c.trim() === '');
    if (allBlank) {
      if (headers !== null) {
        blankRowCount += 1;
        if (blankRowCount <= 20) {
          pushIssue({
            code: 'MALFORMED_CSV',
            message: 'Blank data row skipped.',
            rowNumber: physicalRowStart,
          });
        }
      }
      row = [];
      physicalRowStart = lineNumber;
      return;
    }

    if (row.length > maxColumns) {
      pushIssue({
        code: 'TOO_MANY_COLUMNS',
        message: `Row has more than ${maxColumns} columns.`,
        rowNumber: physicalRowStart,
      });
      row = row.slice(0, maxColumns);
    }

    if (isHeader) {
      headers = row;
    } else {
      if (headers && row.length !== headers.length) {
        pushIssue({
          code: 'ROW_WIDTH_MISMATCH',
          message: `Expected ${headers.length} columns, got ${row.length}.`,
          rowNumber: physicalRowStart,
        });
        while (row.length < headers.length) row.push('');
        if (row.length > headers.length) row = row.slice(0, headers.length);
      }
      if (rows.length >= maxRows) {
        pushIssue({
          code: 'TOO_MANY_ROWS',
          message: `File exceeds ${maxRows} data rows.`,
          rowNumber: physicalRowStart,
        });
      } else {
        rows.push(row);
        rowNumbers.push(physicalRowStart);
      }
    }
    row = [];
    physicalRowStart = lineNumber;
  };

  for await (const chunk of iterateBytes(stream)) {
    byteLength += chunk.byteLength;
    if (byteLength > maxBytes) {
      throw Object.assign(new Error('CSV_BYTE_CEILING'), { code: 'TOO_LARGE' });
    }
    hash.update(chunk);

    // Reject obvious non-UTF8 control NULs early (binary).
    for (let i = 0; i < chunk.byteLength; i += 1) {
      const b = chunk[i]!;
      if (b === 0) {
        pushIssue({
          code: 'ENCODING_UNSUPPORTED',
          message: 'NUL byte encountered; UTF-8 text CSV required.',
          rowNumber: lineNumber,
        });
      }
    }

    const text = Buffer.from(chunk).toString('utf8');
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i]!;
      if (sawCr) {
        sawCr = false;
        if (ch === '\n') {
          // CRLF consumed as one record separator.
          continue;
        }
        // Lone CR — treat as malformed then continue with current char.
        pushIssue({
          code: 'MALFORMED_CSV',
          message: 'Lone CR line ending is not supported.',
          rowNumber: lineNumber,
        });
      }

      if (inQuotes) {
        if (ch === '"') {
          const next = text[i + 1];
          if (next === '"') {
            field += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
          if (ch === '\n') lineNumber += 1;
        }
        continue;
      }

      if (ch === '"') {
        inQuotes = true;
        continue;
      }
      if (ch === ',') {
        finishField(headers === null);
        continue;
      }
      if (ch === '\r') {
        finishField(headers === null);
        finishRow();
        lineNumber += 1;
        sawCr = true;
        continue;
      }
      if (ch === '\n') {
        finishField(headers === null);
        finishRow();
        lineNumber += 1;
        continue;
      }
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0 || inQuotes) {
    finishField(headers === null);
    finishRow();
  }

  if (!headers) {
    pushIssue({ code: 'EMPTY_FILE', message: 'File is empty.', rowNumber: null });
    headers = [];
  }

  return {
    headers,
    rows,
    rowNumbers,
    byteLength,
    sha256Hex: hash.digest('hex'),
    issues,
    blankRowCount,
  };
}

/** Convenience for unit tests — parse a Buffer as a stream. */
export async function parseMigrationCsvBuffer(bytes: Buffer): Promise<CsvParseResult> {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes));
      controller.close();
    },
  });
  return parseMigrationCsvStream(stream);
}
