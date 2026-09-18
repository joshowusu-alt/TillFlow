import OperationalStoreSwitcher from './OperationalStoreSwitcher';

export default function SelectOperationalStoreNotice({
  stores,
  canSwitch,
  title = 'Select a branch',
  detail = 'The header branch switcher is the active store for sales, stock, money, and shifts. TillFlow will not use the first-created store.',
}: {
  stores: { id: string; name: string }[];
  canSwitch: boolean;
  title?: string;
  detail?: string;
}) {
  return (
    <div className="card mx-auto max-w-xl space-y-3 p-6">
      <h1 className="text-xl font-display font-semibold text-ink">{title}</h1>
      <p className="text-sm text-black/60">{detail}</p>
      <OperationalStoreSwitcher
        stores={stores}
        selectedStoreId={null}
        canSwitch={canSwitch}
      />
    </div>
  );
}
