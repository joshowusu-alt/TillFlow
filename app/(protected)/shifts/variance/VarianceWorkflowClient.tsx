'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  approveCashVarianceAction,
  assignCashVarianceAction,
  explainCashVarianceAction,
  resolveCashVarianceAction,
  markCashVarianceReviewedAction,
} from '@/app/actions/shifts';

type Reviewer = { id: string; name: string; role: string };

type Props = {
  investigationId: string;
  status: string;
  cashierExplanation: string | null;
  originalReason: string;
  evidenceNote: string | null;
  managerResolution: string | null;
  assignedReviewerName: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  reviewedByName?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  reviewers: Reviewer[];
  userRole: string;
  canExplain: boolean;
};

export default function VarianceWorkflowClient({
  investigationId,
  status,
  cashierExplanation,
  originalReason,
  evidenceNote,
  managerResolution,
  assignedReviewerName,
  approvedByName,
  approvedAt,
  reviewedByName,
  reviewedAt,
  reviewNote,
  reviewers,
  userRole,
  canExplain,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reviewerUserId, setReviewerUserId] = useState('');
  const [explanation, setExplanation] = useState(cashierExplanation ?? '');
  const [evidence, setEvidence] = useState(evidenceNote ?? '');
  const [resolution, setResolution] = useState(managerResolution ?? '');
  const [note, setNote] = useState('');
  const reviewed = status === 'REVIEWED' || status === 'APPROVED';

  const isManagerOrOwner = userRole === 'MANAGER' || userRole === 'OWNER';
  const isOwner = userRole === 'OWNER';

  const run = (action: (formData: FormData) => Promise<{ success: boolean; error?: string }>, fill: (form: FormData) => void) => {
    setError(null);
    const formData = new FormData();
    formData.set('investigationId', investigationId);
    fill(formData);
    startTransition(async () => {
      const result = await action(formData);
      if (!result.success) {
        setError(result.error ?? 'Could not update the investigation.');
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="card space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-display font-semibold">Cash difference review</h2>
        <span className="rounded-full bg-black/5 px-2 py-1 text-xs font-semibold">{reviewed ? 'Reviewed' : 'Needs review'}</span>
      </div>
      {error ? (
        <div role="alert" className="rounded-xl border border-rose/40 bg-rose/10 px-3 py-2 text-sm text-rose">{error}</div>
      ) : null}

      <div className="text-sm"><strong>Original closing reason</strong><p>{originalReason}</p></div>
      {reviewed ? <div className="text-sm">Reviewed by {reviewedByName ?? approvedByName ?? 'Unknown'}{reviewedAt || approvedAt ? ` · ${new Date((reviewedAt ?? approvedAt)!).toLocaleString()}` : ''}{reviewNote ? <p>{reviewNote}</p> : null}</div> : isManagerOrOwner ? <div className="space-y-2">
        <p className="text-sm text-black/70">Check the cash count and related transactions first. Closing this review removes it from the outstanding list but does not recover cash or change financial records.</p>
        <label className="label" htmlFor="cash-review-note">What did you check and conclude?</label>
        <textarea id="cash-review-note" className="input" value={note} onChange={e => setNote(e.target.value)} />
        {!note.trim() && <p className="text-sm text-black/60">Enter your findings before closing the review.</p>}
        <button type="button" className="btn-primary min-h-11" disabled={isPending || !note.trim()} onClick={() => run(markCashVarianceReviewedAction, form => form.set('note', note))}>Close review with findings</button>
      </div> : null}
      <details className="space-y-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Investigate or assign for follow-up</summary>
      <div className="text-sm text-black/60">
        Assigned reviewer: {assignedReviewerName ?? 'Not assigned'}
      </div>
      {approvedByName ? (
        <div className="text-sm text-black/60">
          Approved by {approvedByName}
          {approvedAt ? ` · ${new Date(approvedAt).toLocaleString()}` : ''}
        </div>
      ) : null}

      {isManagerOrOwner && (status === 'OPEN' || status === 'ASSIGNED') ? (
        <div className="space-y-2 rounded-xl border border-black/10 p-3">
          <label className="label" htmlFor="variance-reviewer">Assign reviewer</label>
          <select id="variance-reviewer" className="input" value={reviewerUserId} onChange={(e) => setReviewerUserId(e.target.value)}>
            <option value="">Choose a reviewer</option>
            {reviewers.map((reviewer) => (
              <option key={reviewer.id} value={reviewer.id}>
                {reviewer.name} ({reviewer.role})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-secondary"
            disabled={isPending || !reviewerUserId}
            onClick={() =>
              run(assignCashVarianceAction, (form) => {
                form.set('reviewerUserId', reviewerUserId);
              })
            }
          >
            {isPending ? 'Saving…' : 'Assign'}
          </button>
        </div>
      ) : null}

      {canExplain && !reviewed && status !== 'RESOLVED' ? (
        <div className="space-y-2 rounded-xl border border-black/10 p-3">
          <label className="label" htmlFor="variance-explanation">Follow-up explanation</label>
          <textarea id="variance-explanation" className="input" rows={3} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
          <label className="label" htmlFor="variance-evidence">Evidence note</label>
          <textarea
            id="variance-evidence"
            className="input"
            rows={2}
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            placeholder="No file upload on this screen — describe the evidence"
          />
          <button
            type="button"
            className="btn-secondary"
            disabled={isPending || !explanation.trim()}
            onClick={() =>
              run(explainCashVarianceAction, (form) => {
                form.set('explanation', explanation);
                form.set('evidenceNote', evidence);
              })
            }
          >
            {isPending ? 'Saving…' : 'Save explanation'}
          </button>
        </div>
      ) : (
        <div className="text-sm">
          <div className="text-xs uppercase text-black/40">Explanation</div>
          <p>{cashierExplanation || '—'}</p>
          {evidenceNote ? <p className="mt-1 text-black/55">Evidence: {evidenceNote}</p> : null}
        </div>
      )}

      {isManagerOrOwner && !reviewed && status !== 'RESOLVED' ? (
        <div className="space-y-2 rounded-xl border border-black/10 p-3">
          <label className="label" htmlFor="variance-resolution">Manager resolution</label>
          <textarea id="variance-resolution" className="input" rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} />
          {!resolution.trim() && <p className="text-sm text-black/60">Describe the outcome before recording a resolution.</p>}
          <button
            type="button"
            className="btn-secondary"
            disabled={isPending || !resolution.trim()}
            onClick={() =>
              run(resolveCashVarianceAction, (form) => {
                form.set('resolution', resolution);
              })
            }
          >
            {isPending ? 'Saving…' : 'Record resolution'}
          </button>
        </div>
      ) : (
        <div className="text-sm">
          <div className="text-xs uppercase text-black/40">Resolution</div>
          <p>{managerResolution || '—'}</p>
        </div>
      )}

      {isOwner && status === 'RESOLVED' ? (
        <button
          type="button"
          className="btn-primary"
          disabled={isPending}
          onClick={() => run(approveCashVarianceAction, () => undefined)}
        >
          {isPending ? 'Approving…' : 'Approve variance'}
        </button>
      ) : null}
      </details>
    </div>
  );
}
