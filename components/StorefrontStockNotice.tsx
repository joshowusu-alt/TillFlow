export default function StorefrontStockNotice({ foodBusiness, count }: { foodBusiness: boolean; count: number }) {
  if (foodBusiness && count === 0) return null;

  const message = foodBusiness
    ? `${count === 1 ? 'One item you sell online is' : `${count} items you sell online are`} out of stock. Use this button to hide ${count === 1 ? 'it' : 'them'} from your online shop. To mark a dish as sold out, open the dish.`
    : count > 0
      ? `${count} published product${count === 1 ? '' : 's'} currently show as out of stock. Hide them now to keep the storefront cleaner for customers.`
      : 'No published products are currently out of stock.';

  return <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">{message}</div>;
}
