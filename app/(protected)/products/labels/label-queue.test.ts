import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  mergeSelectedIds,
  matchesLabelShortcut,
  selectCategoryIds,
} from './label-queue';
import { PRODUCT_FORM_SECTION_TITLES } from '@/components/products/ProductFormSections';

describe('label queue selection', () => {
  const products = [
    {
      id: 'a',
      name: 'Milo',
      barcode: '123',
      sku: 'M1',
      categoryId: 'bev',
      createdAt: new Date().toISOString(),
      qtyOnHandBase: 2,
      reorderPointBase: 4,
    },
    {
      id: 'b',
      name: 'Rice',
      barcode: null,
      sku: 'R1',
      categoryId: null,
      createdAt: '2020-01-01T00:00:00.000Z',
      qtyOnHandBase: 20,
      reorderPointBase: 4,
    },
  ];

  it('selects all filtered, one category, and can clear via merge helpers', () => {
    expect(mergeSelectedIds(['a'], ['b', 'a'])).toEqual(['a', 'b']);
    expect(selectCategoryIds(products, 'bev')).toEqual(['a']);
    expect(selectCategoryIds(products, 'UNCATEGORISED')).toEqual(['b']);
    expect(selectCategoryIds(products, 'ALL')).toEqual(['a', 'b']);
  });

  it('shortcuts recently added, low-stock, and missing-label when data exists', () => {
    expect(matchesLabelShortcut(products[0], 'recent')).toBe(true);
    expect(matchesLabelShortcut(products[1], 'recent')).toBe(false);
    expect(matchesLabelShortcut(products[0], 'low-stock')).toBe(true);
    expect(matchesLabelShortcut(products[1], 'low-stock')).toBe(false);
    expect(matchesLabelShortcut(products[1], 'missing-label')).toBe(true);
    expect(matchesLabelShortcut(products[0], 'missing-label')).toBe(false);
  });

  it('keeps selection, preview, and shortcut controls in the labels client', () => {
    const client = readFileSync(join(process.cwd(), 'app/(protected)/products/labels/LabelPrintClient.tsx'), 'utf8');
    expect(client).toContain('data-select-all-filtered');
    expect(client).toContain('data-select-category');
    expect(client).toContain('data-clear-selection');
    expect(client).toContain('selectAllFiltered');
    expect(client).toContain('selectedIds');
    expect(client).toContain('handlePreview');
    expect(client).toContain('Preview Labels');
    expect(client).toContain('Recently added');
    expect(client).toContain('Low stock');
    expect(client).toContain('Missing label');
    expect(client).toContain('useListState');
  });
});

describe('Add product form sections', () => {
  it('renders Essential, Stock and purchasing, and Advanced headings on the create form', () => {
    const page = readFileSync(join(process.cwd(), 'app/(protected)/products/page.tsx'), 'utf8');
    for (const title of PRODUCT_FORM_SECTION_TITLES) {
      expect(page).toContain(`title="${title}"`);
    }
    expect(page).toContain('name="name"');
    expect(page).toContain('name="preferredSupplierId"');
    expect(page).toContain('name="vatRateBps"');
    expect(page).toContain('OpeningStockFields');
    expect(page).toContain('includeOpeningStock={false}');
  });
});
