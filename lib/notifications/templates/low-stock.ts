import { buildWhatsAppDeepLink } from '@/lib/notifications/providers';

export type LowStockAlertTemplateItem = {
  categoryName: string;
  productName: string;
  currentQty: number;
  reorderQty: number;
};

export function buildLowStockAlertTemplate(input: {
  recipient?: string | null;
  businessName: string;
  storeName?: string | null;
  items: LowStockAlertTemplateItem[];
}) {
  const lines: string[] = [`${input.businessName} - Low Stock Alert`];
  const grouped = new Map<string, LowStockAlertTemplateItem[]>();

  if (input.storeName) {
    lines.push(`Branch: ${input.storeName}`);
  }

  lines.push('', `Items at or below reorder level (${input.items.length}):`);

  for (const item of input.items) {
    grouped.set(item.categoryName, [...(grouped.get(item.categoryName) ?? []), item]);
  }

  for (const [categoryName, items] of grouped.entries()) {
    lines.push('', `${categoryName}:`);
    for (const item of items) {
      lines.push(`- ${item.productName}: ${item.currentQty} on hand / ${item.reorderQty} reorder`);
    }
  }

  lines.push('', 'Please restock soon.', 'Sent by TillFlow POS');

  const text = lines.join('\n');
  return {
    text,
    deepLink: buildWhatsAppDeepLink(input.recipient ?? '', text),
  };
}
