import type { LabelData } from '../types';
import { renderShelfTagFragment } from './shelf-tag';

const LABELS_PER_PAGE = 24;

function chunkLabels(labels: LabelData[]): LabelData[][] {
  if (labels.length === 0) {
    return [[]];
  }

  return Array.from({ length: Math.ceil(labels.length / LABELS_PER_PAGE) }, (_, index) =>
    labels.slice(index * LABELS_PER_PAGE, (index + 1) * LABELS_PER_PAGE),
  );
}

async function renderPage(pageLabels: LabelData[], pageIndex: number): Promise<string> {
  const filledCells = await Promise.all(
    pageLabels.map(async (label, labelIndex) => {
      const content = await renderShelfTagFragment(label, {
        widthMm: 63,
        heightMm: 34,
        paddingMm: 2,
        borderStyle: '0.25mm dashed #9ca3af',
      });

      return `<div data-sheet-cell="filled" data-label-index="${pageIndex * LABELS_PER_PAGE + labelIndex}" style="width:63mm;height:34mm;display:flex;align-items:center;justify-content:center;">${content}</div>`;
    }),
  );

  const emptyCells = Array.from({ length: Math.max(0, LABELS_PER_PAGE - pageLabels.length) }, (_, index) => {
    return `<div data-sheet-cell="empty" data-empty-index="${pageIndex * LABELS_PER_PAGE + pageLabels.length + index}" style="width:63mm;height:34mm;border:0.25mm dashed rgba(156,163,175,0.35);border-radius:1mm;"></div>`;
  });

  return `<section class="sheet-page" data-page-index="${pageIndex}" style="width:210mm;min-height:297mm;padding:9mm 8mm;display:grid;grid-template-columns:repeat(3, 63mm);grid-template-rows:repeat(8, 34mm);gap:2mm;align-content:start;page-break-after:${pageIndex === -1 ? 'auto' : 'always'};">
    ${[...filledCells, ...emptyCells].join('')}
  </section>`;
}

/**
 * Generate HTML for an A4 page containing a grid of labels.
 * 3 columns × 8 rows = 24 labels per page.
 * Designed for standard adhesive label sheets.
 */
export async function renderA4Sheet(labels: LabelData[]): Promise<string> {
  const pages = await Promise.all(
    chunkLabels(labels).map(async (pageLabels, pageIndex, allPages) => {
      const pageHtml = await renderPage(pageLabels, pageIndex);
      return pageIndex === allPages.length - 1
        ? pageHtml.replace('page-break-after:always;', 'page-break-after:auto;')
        : pageHtml;
    }),
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TillFlow A4 Labels</title>
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
      flex-direction: column;
      align-items: center;
      gap: 4mm;
      padding: 4mm 0;
    }
    @page {
      size: A4 portrait;
      margin: 0;
    }
    @media print {
      html, body { background: #ffffff; }
      body { padding: 0; gap: 0; }
      .sheet-page {
        margin: 0 !important;
        box-shadow: none !important;
      }
    }
  </style>
</head>
<body>
  ${pages.join('')}
</body>
</html>`;
}
