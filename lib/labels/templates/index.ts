import type { LabelData, LabelSize } from '../types';
import { renderA4Sheet } from './a4-sheet';
import { renderProductSticker } from './product-sticker';
import { renderShelfTag } from './shelf-tag';

function expandItems(items: Array<{ data: LabelData; quantity: number }>): LabelData[] {
  return items.flatMap(({ data, quantity }) =>
    Array.from({ length: Math.max(0, Math.floor(quantity)) }, () => data),
  );
}

function wrapIndividualLabels(labelsHtml: string, template: LabelSize): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TillFlow ${template} Labels</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #f3f4f6;
      color: #111827;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    }
    body {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 4mm;
      padding: 4mm;
    }
    @media print {
      html, body { background: #ffffff; }
      body { padding: 0; gap: 2mm; }
    }
  </style>
</head>
<body data-rendered-template="${template}">
  ${labelsHtml}
</body>
</html>`;
}

/**
 * Render labels as HTML for browser printing.
 */
export async function renderLabelsHtml(
  items: Array<{ data: LabelData; quantity: number }>,
  template: LabelSize,
): Promise<string> {
  const expandedItems = expandItems(items);

  if (template === 'A4_SHEET') {
    return renderA4Sheet(expandedItems);
  }

  const renderLabel = template === 'PRODUCT_STICKER' ? renderProductSticker : renderShelfTag;
  const labelsHtml = await Promise.all(expandedItems.map((item) => renderLabel(item)));

  return wrapIndividualLabels(labelsHtml.join(''), template);
}

export { renderA4Sheet, renderProductSticker, renderShelfTag };
