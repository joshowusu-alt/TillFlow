'use client';

import Badge from '@/components/Badge';
import type { LabelData, LabelSize } from '@/lib/labels/types';

const labelMeta: Record<LabelSize, { name: string; size: string; description: string }> = {
  SHELF_TAG: {
    name: 'Shelf tag',
    size: '50 × 30 mm',
    description: 'Compact pricing labels for shelves and baskets.',
  },
  PRODUCT_STICKER: {
    name: 'Product sticker',
    size: '60 × 40 mm',
    description: 'Detailed label with category, SKU, and date.',
  },
  A4_SHEET: {
    name: 'A4 sheet',
    size: '24 labels per page',
    description: '3 columns × 8 rows for standard adhesive sheets.',
  },
};

function formatUnit(unit: string | undefined) {
  if (!unit) {
    return '';
  }

  return unit.startsWith('/') ? unit : `/${unit}`;
}

function BarcodeBars({ value }: { value?: string }) {
  if (!value) {
    return (
      <div className="flex h-14 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-400">
        No barcode
      </div>
    );
  }

  const pattern = value
    .slice(0, 24)
    .split('')
    .map((char, index) => ((char.charCodeAt(0) + index) % 4) + 1);

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="flex h-10 items-end justify-center gap-px overflow-hidden">
        {pattern.map((width, index) => (
          <span
            key={`${value}-${index}`}
            className="rounded-sm bg-slate-900"
            style={{
              width: `${width}px`,
              height: `${18 + ((index * 7) % 18)}px`,
              opacity: index % 5 === 0 ? 0.75 : 1,
            }}
          />
        ))}
      </div>
      <div className="mt-1 text-center font-mono text-[10px] tracking-[0.2em] text-slate-500">
        {value}
      </div>
    </div>
  );
}

function ShelfTagPreview({ data }: { data: LabelData }) {
  return (
    <div className="mx-auto flex min-h-[172px] w-full max-w-[320px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-base font-bold leading-tight text-slate-900">{data.productName}</div>
      <BarcodeBars value={data.barcode} />
      <div className="flex items-end gap-2">
        <div className="text-2xl font-black text-slate-900">{data.price}</div>
        {data.unit ? <div className="pb-1 text-sm text-slate-500">{formatUnit(data.unit)}</div> : null}
      </div>
    </div>
  );
}

function ProductStickerPreview({ data }: { data: LabelData }) {
  return (
    <div className="mx-auto flex min-h-[208px] w-full max-w-[340px] flex-col justify-between rounded-2xl border border-dashed border-slate-300 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        {data.category ? <Badge tone="info">{data.category}</Badge> : <span />}
        {data.sku ? <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">SKU {data.sku}</span> : null}
      </div>
      <div className="text-base font-bold leading-tight text-slate-900">{data.productName}</div>
      <BarcodeBars value={data.barcode} />
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-end gap-2">
          <div className="text-2xl font-black text-slate-900">{data.price}</div>
          {data.unit ? <div className="pb-1 text-sm text-slate-500">{formatUnit(data.unit)}</div> : null}
        </div>
        <div className="text-xs font-medium text-slate-400">{data.date ?? new Date().toISOString().slice(0, 10)}</div>
      </div>
    </div>
  );
}

function A4SheetPreview({ data }: { data: LabelData }) {
  return (
    <div className="mx-auto w-full max-w-[360px] rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className={`rounded-xl border p-2 ${index === 0 ? 'border-blue-200 bg-blue-50/60' : 'border-dashed border-slate-200 bg-slate-50/70'}`}
          >
            {index === 0 ? (
              <div className="flex h-full min-h-[94px] flex-col justify-between">
                <div className="text-[10px] font-bold leading-tight text-slate-900">{data.productName}</div>
                <div className="rounded border border-slate-200 bg-white px-1.5 py-1">
                  <div className="flex h-5 items-end justify-center gap-px overflow-hidden">
                    {data.barcode
                      ? data.barcode
                          .slice(0, 12)
                          .split('')
                          .map((char, barcodeIndex) => (
                            <span
                              key={`${char}-${barcodeIndex}`}
                              className="bg-slate-900"
                              style={{
                                width: `${((char.charCodeAt(0) + barcodeIndex) % 3) + 1}px`,
                                height: `${9 + ((barcodeIndex * 3) % 8)}px`,
                              }}
                            />
                          ))
                      : null}
                  </div>
                </div>
                <div className="text-[11px] font-bold text-slate-900">{data.price}</div>
              </div>
            ) : (
              <div className="h-[94px] rounded-lg border border-dashed border-slate-200 bg-white/80" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LabelPreview({ data, size }: { data: LabelData; size: LabelSize }) {
  const meta = labelMeta[size];

  return (
    <div className="rounded-[1.5rem] border border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-blue-50/40 p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Single label preview</div>
          <div className="mt-1 text-lg font-display font-semibold text-ink">{meta.name}</div>
          <div className="mt-1 text-sm text-slate-500">{meta.description}</div>
        </div>
        <Badge tone="neutral">{meta.size}</Badge>
      </div>

      {size === 'SHELF_TAG' ? <ShelfTagPreview data={data} /> : null}
      {size === 'PRODUCT_STICKER' ? <ProductStickerPreview data={data} /> : null}
      {size === 'A4_SHEET' ? <A4SheetPreview data={data} /> : null}
    </div>
  );
}
