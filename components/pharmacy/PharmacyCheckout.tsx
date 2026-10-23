'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { pharmacyCartStatusAction, requestPharmacyReviewAction } from '@/app/actions/pharmacy';

export type PharmacyCheckoutCheck = { signature: string; ready: boolean; reviewId?: string; confirmed?: boolean; expiresAt?: string };
type CartStatus = Extract<Awaited<ReturnType<typeof pharmacyCartStatusAction>>, { success: true }>['data'];

export default function PharmacyCheckout({ storeId, checkoutRef, cartJson, signature, onChange }: { storeId: string; checkoutRef: string; cartJson: string; signature: string; onChange: (check: PharmacyCheckoutCheck) => void }) {
  const [status, setStatus] = useState<CartStatus | null>(null);
  const [reviewId, setReviewId] = useState('');
  const [patientName, setPatientName] = useState('');
  const [birth, setBirth] = useState('');
  const [prescriptionId, setPrescriptionId] = useState('');
  const [ageChecked, setAgeChecked] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [batchesConfirmed, setBatchesConfirmed] = useState(false);
  const generation = useRef(0);
  const productIds = [...new Set((JSON.parse(cartJson) as { productId: string }[]).map(line => line.productId))];
  const medicines = status?.rules.filter(rule => rule.medicineClass !== 'GENERAL') ?? [];
  const unclassified = status?.enabled && status.rules.length !== productIds.length;
  const needsIdentity = medicines.some(rule => rule.medicineClass === 'PRESCRIPTION' || rule.minimumPatientAge !== null);
  const professional = medicines.some(rule => ['PHARMACIST', 'PRESCRIPTION'].includes(rule.medicineClass) || Boolean(rule.checkInstructions));
  const approved = status?.review?.status === 'APPROVED' && Boolean(status.review.expiresAt && new Date(status.review.expiresAt).getTime() > Date.now());

  useEffect(() => {
    const token = ++generation.current;
    setStatus(null); setReviewId(''); setError(''); setBatchesConfirmed(false);
    onChange({ signature, ready: false });
    pharmacyCartStatusAction({ storeId, productIds: (JSON.parse(cartJson) as { productId: string }[]).map(line => line.productId) }).then(result => {
      if (generation.current !== token) return;
      if (!result.success) { setError(result.error); return; }
      setStatus(result.data);
      onChange({ signature, ready: !result.data.enabled || (result.data.rules.length === productIds.length && result.data.rules.every(rule => rule.medicineClass === 'GENERAL')) });
    }).catch(() => { if (generation.current === token) setError('Connect to the internet to load pharmacy checks.'); });
    return () => { if (generation.current === token) generation.current = token + 1; };
    // signature includes the complete cart and checkout identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, storeId, onChange]);

  useEffect(() => {
    const expiry = status?.review?.expiresAt;
    if (!expiry) return;
    const timer = setTimeout(() => { onChange({ signature, ready: false }); setError('The approval expired. Request a new check.'); }, Math.max(0, new Date(expiry).getTime() - Date.now()));
    return () => clearTimeout(timer);
  }, [status?.review?.expiresAt, signature, onChange]);

  const invalidate = () => {
    generation.current++;
    setBatchesConfirmed(false);
    setReviewId(''); setStatus(current => current ? { ...current, review: null } : current);
    onChange({ signature, ready: false });
  };

  const refresh = async (id = reviewId) => {
    const token = generation.current;
    const result = await pharmacyCartStatusAction({ storeId, productIds, reviewId: id });
    if (token !== generation.current) return;
    if (!result.success) throw new Error(result.error);
    setStatus(result.data);
    setBatchesConfirmed(false);
    onChange({ signature, ready: false });
  };

  const request = async () => {
    const token = ++generation.current;
    setBusy(true); setError(''); onChange({ signature, ready: false });
    try {
      const result = await requestPharmacyReviewAction({ storeId, checkoutRef, lines: JSON.parse(cartJson), patientName, patientDateOfBirth: birth, prescriptionId, ageCheckConfirmed: ageChecked });
      if (token !== generation.current) return;
      if (!result.success) throw new Error(result.error);
      setReviewId(result.data.id);
      await refresh(result.data.id);
    } catch (issue) { if (token === generation.current) setError(issue instanceof Error ? issue.message : 'Could not request dispensing review.'); }
    finally { setBusy(false); }
  };

  if (status && !status.enabled) return <p className="card p-3 text-sm">Pharmacy checks are in setup mode. <Link href="/pharmacy" className="text-blue-700 underline">Open pharmacy setup</Link></p>;
  if (status && !unclassified && !medicines.length) return null;
  return <section className="card space-y-3 border-blue-200 p-4" aria-label="Pharmacy dispensing checks"><h2 className="font-semibold">Pharmacy dispensing checks</h2><Link className="text-sm font-semibold text-blue-700" href="/pharmacy" target="_blank" rel="noreferrer">Open pharmacy workspace ↗</Link>
    {!status ? <p className="text-sm">Loading current product checks…</p> : null}
    {unclassified ? <p className="rounded-xl bg-amber-50 p-3 text-sm">One or more cart products need classification in Pharmacy before selling.</p> : null}
    {medicines.map(rule => <p className="rounded-xl bg-blue-50 p-2 text-sm" key={rule.productId}>{rule.productName} · {rule.medicineClass.replace('_', ' ')}{rule.minimumPatientAge !== null ? ` · Patient age ${rule.minimumPatientAge}+; check the patient, not just the collector` : ''}{rule.checkInstructions ? ` · Pharmacist check: ${rule.checkInstructions}` : ''}</p>)}
    {medicines.length && !unclassified ? <>
      {needsIdentity ? <div className="grid gap-3 sm:grid-cols-2"><label className="label">Patient name<input className="input mt-1 normal-case tracking-normal font-normal" maxLength={160} value={patientName} onChange={event => { invalidate(); setPatientName(event.target.value); }} /></label><label className="label">Patient date of birth<input className="input mt-1 normal-case tracking-normal font-normal" type="date" value={birth} onChange={event => { invalidate(); setBirth(event.target.value); }} /></label></div> : null}
      {medicines.some(rule => rule.minimumPatientAge !== null) ? <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={ageChecked} onChange={event => { invalidate(); setAgeChecked(event.target.checked); }} /> I checked the patient’s age according to the pharmacy’s policy.</label> : null}
      {medicines.some(rule => rule.medicineClass === 'PRESCRIPTION') ? <label className="label">Reviewed prescription ID<input className="input mt-1 normal-case tracking-normal font-normal" value={prescriptionId} onChange={event => { invalidate(); setPrescriptionId(event.target.value); }} placeholder="Recorded by the pharmacist in Pharmacy" /></label> : null}
      <div className="flex flex-wrap gap-2"><button type="button" className="btn-primary" disabled={busy} onClick={request}>{busy ? 'Checking…' : professional ? 'Request pharmacist review' : 'Check available medicine batches'}</button>{reviewId ? <button type="button" className="btn-ghost" disabled={busy} onClick={() => { setBusy(true); refresh().catch(issue => setError(issue.message)).finally(() => setBusy(false)); }}>Refresh review status</button> : null}</div>
      {status?.review?.status === 'PENDING' ? <p role="status" className="text-sm">Waiting for a pharmacist. Keep this cart open; the pharmacist can approve it from the Pharmacy review queue on another device.</p> : null}
      {status?.review?.status === 'DECLINED' ? <p className="text-sm text-red-700">The pharmacist declined this request. Review the medicine with them.</p> : null}
      {approved ? <div className="space-y-2 rounded-xl bg-emerald-50 p-3 text-sm"><p className="font-semibold">Approved batches · check the physical packs</p>{status?.review?.batches.map(row => <p key={row.id}>{row.productName} · {row.batch?.batchNumber ?? row.batchId} · {row.qtyBase} base units · Expires {row.batch?.expiresAt ? new Date(row.batch.expiresAt).toISOString().slice(0, 10) : ''}</p>)}<label className="flex items-start gap-2"><input type="checkbox" checked={batchesConfirmed} onChange={event => { setBatchesConfirmed(event.target.checked); onChange({ signature, ready: event.target.checked, confirmed: event.target.checked, reviewId, expiresAt: status?.review?.expiresAt }); }} /> I selected these exact physical batches for this sale.</label></div> : null}
    </> : null}
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
  </section>;
}
