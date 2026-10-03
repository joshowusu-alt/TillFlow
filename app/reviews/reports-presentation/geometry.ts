export type ScreenGeometry = {
  label: string;
  viewport: number;
  gutter: number;
  contentWidth: number;
  paddingLayers: number;
  cardWidth: number | null;
  figureTop: number | null;
  figureViewportTop: number | null;
  columns: string;
  frameOverflow: number;
  documentOverflow: number;
  bottomNav: number;
  horizontalOverflowNodes: number;
};

function paddingLeft(node: Element) {
  return Number.parseFloat(window.getComputedStyle(node).paddingLeft) || 0;
}

export function measureCustomerScreens(): ScreenGeometry[] {
  const doc = document.documentElement;
  const screens = [...document.querySelectorAll<HTMLElement>('[data-customer-screen]')];
  return screens.map((screen) => {
    const main = screen.querySelector<HTMLElement>('[data-shell-main]');
    const card = screen.querySelector<HTMLElement>('[data-primary-card]');
    const figure = screen.querySelector<HTMLElement>('[data-first-figure]');
    const grid = screen.querySelector<HTMLElement>('[data-reconciliation-grid], [data-directory-grid]');
    const bottom = document.querySelector<HTMLElement>('[data-shell-bottom]');
    const bottomBox = bottom?.getBoundingClientRect();
    const bottomNav = bottomBox && bottomBox.height > 0 && window.getComputedStyle(bottom!).display !== 'none'
      ? Math.round(bottomBox.height)
      : 0;
    let paddingLayers = 0;
    if (main) {
      if (paddingLeft(main) > 0) paddingLayers += 1;
      if (card) {
        let node: HTMLElement | null = card;
        while (node && node !== main) {
          if (paddingLeft(node) > 0) paddingLayers += 1;
          node = node.parentElement;
        }
      }
    }
    const screenBox = screen.getBoundingClientRect();
    const figureBox = figure?.getBoundingClientRect();
    const tracks = grid ? window.getComputedStyle(grid).gridTemplateColumns.split(' ').filter((part) => part !== '0px') : [];
    let horizontalOverflowNodes = 0;
    for (const node of screen.querySelectorAll<HTMLElement>('body, [data-financial-amount], a, p, h1, h2, section, div')) {
      const box = node.getBoundingClientRect();
      if (box.width > 0 && box.right > screenBox.right + 1) horizontalOverflowNodes += 1;
    }
    return {
      label: screen.dataset.screenLabel ?? '',
      viewport: Math.round(screen.clientWidth),
      gutter: main ? Math.round(paddingLeft(main)) : 0,
      contentWidth: main ? Math.round(main.clientWidth) : 0,
      paddingLayers,
      cardWidth: card ? Math.round(card.clientWidth) : null,
      figureTop: figureBox ? Math.round(figureBox.top - screenBox.top) : null,
      figureViewportTop: figureBox ? Math.round(figureBox.top) : null,
      columns: tracks.length ? String(tracks.length) : '1',
      frameOverflow: screen.scrollWidth - screen.clientWidth,
      documentOverflow: doc.scrollWidth - doc.clientWidth,
      bottomNav,
      horizontalOverflowNodes,
    };
  });
}

export function formatGeometry(rows: ScreenGeometry[]) {
  return rows.map((row) => [
    row.label,
    `viewport ${row.viewport}`,
    `gutter ${row.gutter}`,
    `content ${row.contentWidth}`,
    `paddingLayers ${row.paddingLayers}`,
    `card ${row.cardWidth ?? 'none'}`,
    `figureTop ${row.figureTop ?? 'none'}`,
    `figureViewport ${row.figureViewportTop ?? 'none'}`,
    `columns ${row.columns}`,
    `frameOverflow ${row.frameOverflow}`,
    `documentOverflow ${row.documentOverflow}`,
    `bottomNav ${row.bottomNav}`,
    `horizontalNodes ${row.horizontalOverflowNodes}`,
  ].join(' | ')).join('\n');
}
