'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { transferBusinessCashAction } from '@/app/actions/purchase-funding';

export default function CashTransferForm({ storeId, people, tills }: { storeId: string; people: { id: string; name: string; role: string }[]; tills: { id: string; name: string }[] }) {
  const router = useRouter();
  const [direction, setDirection] = useState('ISSUE');
  const [source, setSource] = useState('TILL');
  const [key, setKey] = useState('');
  useEffect(() => { setKey(crypto.randomUUID()); }, []);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  return <form className="card mt-6 space-y-4 p-5" action={async data => {
    setPending(true); setMessage('');
    try { const result = await transferBusinessCashAction(data); if (!result.success) setMessage(result.error); else { setMessage('Cash transfer recorded.'); setKey(crypto.randomUUID()); router.refresh(); } }
    finally { setPending(false); }
  }}>
    <input type="hidden" name="storeId" value={storeId} /><input type="hidden" name="key" value={key} />
    <div><label className="label" htmlFor="cash-direction">Cash movement</label><select id="cash-direction" className="input" name="direction" value={direction} onChange={event => { setDirection(event.target.value); setSource('TILL'); }}><option value="ISSUE">Give business cash to a person</option><option value="RETURN">Return unused business cash</option><option value="REPAY_OWNER">Repay an owner’s recorded advance</option></select></div>
    {direction !== 'REPAY_OWNER' ? <div><label className="label" htmlFor="cash-holder">Person holding business cash</label><select id="cash-holder" className="input" name="holderId" required defaultValue=""><option value="">Select person…</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></div> : null}
    <div><label className="label" htmlFor="transfer-source">{direction === 'RETURN' ? 'Money goes to' : 'Money comes from'}</label><select id="transfer-source" className="input" name="source" value={source} onChange={event => setSource(event.target.value)}><option value="TILL">Till drawer</option><option value="BANK">Business bank / MoMo</option>{direction === 'ISSUE' ? <><option value="OWNER_LOAN">Owner’s money — repay owner</option><option value="OWNER_CAPITAL">Owner’s money — contribution</option></> : null}</select></div>
    {source === 'TILL' ? <div><label className="label" htmlFor="transfer-till">Open till</label><select id="transfer-till" className="input" name="tillId" required defaultValue=""><option value="">Select open till…</option>{tills.map(till => <option key={till.id} value={till.id}>{till.name}</option>)}</select></div> : null}
    {source.startsWith('OWNER_') || direction === 'REPAY_OWNER' ? <div><label className="label" htmlFor="transfer-owner">{direction === 'REPAY_OWNER' ? 'Owner being repaid' : 'Owner providing money'}</label><select id="transfer-owner" className="input" name="ownerId" required defaultValue=""><option value="">Select owner…</option>{people.filter(person => person.role === 'OWNER').map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></div> : null}
    <div><label className="label" htmlFor="cash-amount">Amount</label><input id="cash-amount" className="input" name="amount" type="number" step="0.01" min="0.01" required /></div>
    <div><label className="label" htmlFor="cash-note">Reason / reference</label><input id="cash-note" className="input" name="note" required maxLength={300} /></div>
    <p className="text-sm text-black/60">A handover or return moves business money. It does not create sales or an expense. Only the selected till drawer is adjusted.</p>
    {message ? <p role="status">{message}</p> : null}<button className="btn-primary" disabled={pending || !key}>{pending ? 'Recording…' : 'Record cash movement'}</button>
  </form>;
}
