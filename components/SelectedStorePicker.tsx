export default function SelectedStorePicker({
  stores,
  selectedStoreId,
  action,
}: {
  stores: { id: string; name: string }[];
  selectedStoreId: string | null;
  action: string;
}) {
  return (
    <form method="get" action={action} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="label" htmlFor="storeId">
          Store
        </label>
        <select
          id="storeId"
          name="storeId"
          className="input"
          defaultValue={selectedStoreId ?? ''}
          required={stores.length > 1}
        >
          {stores.length > 1 ? <option value="">Select a store</option> : null}
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn-secondary">
        Use this store
      </button>
    </form>
  );
}
