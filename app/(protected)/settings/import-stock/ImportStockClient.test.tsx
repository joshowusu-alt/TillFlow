import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ImportStockClient from './ImportStockClient';
import {
  MANUAL_IMPORT_GATE_CSV_FILENAME,
  RELIABILITY_MANUAL_IMPORT_GATE_PRODUCT,
  manualImportGateCsv,
} from '@/lib/reliability/manual-import-gate';
import { parseStockFileDetailed } from '@/lib/import/parse-stock-file';
import { downloadTemplateForMode } from '@/lib/import/stock-template';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/ResetPurchaseDataButton', () => ({
  default: () => null,
}));

vi.mock('@/lib/import/stock-template', async () => {
  const actual = await vi.importActual<typeof import('@/lib/import/stock-template')>(
    '@/lib/import/stock-template',
  );
  return {
    ...actual,
    downloadTemplateForMode: vi.fn(),
  };
});

vi.mock('@/app/actions/import-catalog', () => ({
  getImportCatalogContext: vi.fn(async () => ({
    success: true,
    data: {
      productNames: [],
      barcodes: [],
      skus: [],
      categories: [],
      suppliers: [],
    },
  })),
}));

const units = [{ id: 'u-piece', name: 'Piece', pluralName: 'Pieces' }];

function renderImporter() {
  return render(<ImportStockClient units={units} currency="GHS" />);
}

function gateCsvFile() {
  const contents = manualImportGateCsv();
  const file = new File([contents], MANUAL_IMPORT_GATE_CSV_FILENAME, {
    type: 'text/csv',
  });
  if (typeof file.text !== 'function') {
    Object.defineProperty(file, 'text', {
      configurable: true,
      value: async () => contents,
    });
  }
  return file;
}

describe('settings Import Stock destination', () => {
  it('is the href of the settings Import Stock control', () => {
    const settings = readFileSync(
      join(process.cwd(), 'app/(protected)/settings/page.tsx'),
      'utf8',
    );
    expect(settings).toContain('href="/settings/import-stock"');
    expect(settings).toContain('>Import Stock</a>');
  });
});

describe('ImportStockClient real purpose tiles', () => {
  it('exposes CATALOGUE via testid and aria-label Product catalogue, not the explanation as the name', () => {
    renderImporter();
    expect(screen.getByRole('heading', { name: 'What are you importing?' })).toBeInTheDocument();
    const tile = screen.getByTestId('import-mode-CATALOGUE');
    expect(tile).toHaveAttribute('aria-label', 'Product catalogue');
    expect(tile).toHaveAccessibleName('Product catalogue');
    expect(screen.getByRole('button', { name: /^Product catalogue$/ })).toBe(tile);
    expect(
      screen.getByText(
        'Add or update products, prices and units. Quantities are ignored — no stock or accounting entries.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Select a purpose to continue.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download\s+template/i })).toBeDisabled();
  });

  it('does not treat template download as import success', async () => {
    renderImporter();
    fireEvent.click(screen.getByTestId('import-mode-CATALOGUE'));
    const download = screen.getByRole('button', {
      name: /Download Product catalogue template/i,
    });
    expect(download).toBeEnabled();
    fireEvent.click(download);
    expect(vi.mocked(downloadTemplateForMode)).toHaveBeenCalledWith('CATALOGUE');
    expect(screen.queryByTestId('import-stock-ready-count')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Confirm Import/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('import-stock-file-input')).toBeInTheDocument();
  });
});

describe('REL-IMP-P104-01 CSV parse and import preview', () => {
  it('parses the canonical gate CSV to one ready identity row', async () => {
    const parsed = await parseStockFileDetailed(gateCsvFile());
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.sku).toBe(RELIABILITY_MANUAL_IMPORT_GATE_PRODUCT.sku);
    expect(parsed.rows[0]?.name).toBe(RELIABILITY_MANUAL_IMPORT_GATE_PRODUCT.name);
    expect(parsed.rows[0]?.errors).toEqual([]);
  });

  it('requires purpose then upload before Confirm Import; never lands on No products yet', async () => {
    renderImporter();
    fireEvent.change(screen.getByTestId('import-stock-file-input'), {
      target: { files: [gateCsvFile()] },
    });
    expect(
      await screen.findByText('Choose an import purpose before uploading a file.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('import-stock-ready-count')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('import-mode-CATALOGUE'));
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Download Product catalogue template/i }),
      ).toBeEnabled();
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('import-stock-file-input'), {
        target: { files: [gateCsvFile()] },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('import-stock-purpose')).toHaveTextContent('Product catalogue');
    });
    expect(screen.getByTestId('import-stock-accepted-file')).toHaveTextContent(
      `File: ${MANUAL_IMPORT_GATE_CSV_FILENAME}`,
    );
    expect(screen.getByTestId('import-stock-ready-count')).toHaveTextContent('Ready 1');
    expect(screen.getAllByText(RELIABILITY_MANUAL_IMPORT_GATE_PRODUCT.sku).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /Confirm Import \(1 products\)/i })).toBeEnabled();
    expect(screen.queryByText('No products yet.')).not.toBeInTheDocument();
  });
});
