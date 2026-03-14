import type { BarcodeFormat } from './barcode-generator';

export type LabelSize = 'SHELF_TAG' | 'PRODUCT_STICKER' | 'A4_SHEET';
export type LabelPrintMode = 'BROWSER_PDF' | 'ZPL_DIRECT';

export interface LabelData {
  productName: string;
  price: string;
  barcode?: string;
  barcodeFormat?: BarcodeFormat;
  sku?: string;
  unit?: string;
  category?: string;
  date?: string;
  currency?: string;
}

export interface LabelPrintRequest {
  products: Array<{
    productId: string;
    quantity: number;
  }>;
  template: LabelSize;
  printMode: LabelPrintMode;
}

export interface LabelDimensions {
  widthMm: number;
  heightMm: number;
  columns?: number;
  rows?: number;
  marginMm?: number;
}

export const LABEL_DIMENSIONS: Record<LabelSize, LabelDimensions> = {
  SHELF_TAG: { widthMm: 50, heightMm: 30 },
  PRODUCT_STICKER: { widthMm: 60, heightMm: 40 },
  A4_SHEET: { widthMm: 210, heightMm: 297, columns: 3, rows: 8, marginMm: 5 },
};
