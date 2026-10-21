'use client';
import { useEffect, useState } from 'react';
import { listFundingPeopleAction } from '@/app/actions/purchase-funding';
export default function SupplierCashSourceFields({ storeId, source, onSource }: { storeId?: string; source: string; onSource: (value: string) => void }) {
  const [people, setPeople] = useState<{ id: string; name: string; role: string; balancePence: number }[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!storeId || source === 'TILL') return;
    let active = true;
    listFundingPeopleAction(storeId).then(result => { if (!active) return; if (result.success) setPeople(result.data); else setError(result.error); }).catch(() => { if (active) setError('Could not load cash holders. Try again.'); });
    return () => { active = false; };
  }, [storeId, source]);
  return <div className="space-y-2"><label className="block text-xs font-medium">Cash source<select aria-label="Cash source" className="input" name="cashSource" value={source} onChange={event => onSource(event.target.value)}><option value="TILL">Till drawer</option><option value="BUSINESS_CASH">Business cash held outside the till</option><option value="OWNER_LOAN">Owner’s money — repay owner</option><option value="OWNER_CAPITAL">Owner’s money — contribution</option></select></label>
    {source !== 'TILL' ? <label className="block text-xs font-medium">{source === 'BUSINESS_CASH' ? 'Person holding business cash' : 'Owner providing money'}<select aria-label={source === 'BUSINESS_CASH' ? 'Cash holder' : 'Funding owner'} className="input" required name={source === 'BUSINESS_CASH' ? 'cashHolderId' : 'fundingOwnerId'} defaultValue=""><option value="">Select person…</option>{people.filter(person => source === 'BUSINESS_CASH' || person.role === 'OWNER').map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label> : null}
    {error ? <p role="alert">{error}</p> : null}{storeId ? <a className="block text-xs underline" href={`/purchases/cash?storeId=${storeId}`}>Cash handovers and owner balances</a> : null}
  </div>;
}
