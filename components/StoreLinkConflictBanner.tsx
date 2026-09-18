import { switchOperationalStoreAction } from '@/app/actions/operational-store';

export default function StoreLinkConflictBanner({
  activeStoreName,
  linkStoreName,
  linkStoreId,
  returnTo,
}: {
  activeStoreName: string;
  linkStoreName: string;
  linkStoreId: string;
  returnTo: string;
}) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-semibold">This link is for {linkStoreName}.</p>
      <p className="mt-1">
        Your active branch is still <span className="font-semibold">{activeStoreName}</span>.
        Transactions will be recorded there until you switch in the header.
      </p>
      <form action={switchOperationalStoreAction} className="mt-3">
        <input type="hidden" name="storeId" value={linkStoreId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <button type="submit" className="btn-secondary text-xs">
          Switch to {linkStoreName}
        </button>
      </form>
    </div>
  );
}
