'use client';

import { useState } from 'react';
import { submitMerchantHelpRequestAction } from '@/app/actions/help-request';
import { getSetupHelpHref } from '@/lib/activation-display';

const ISSUE_TYPES = [
  { value: 'PRODUCT_SETUP', label: 'Product setup' },
  { value: 'IMPORT_STOCK', label: 'Import / stock' },
  { value: 'POS_ISSUE', label: 'POS / selling' },
  { value: 'REPORT_ISSUE', label: 'Reports' },
  { value: 'BILLING_ISSUE', label: 'Billing / trial' },
  { value: 'LOGIN', label: 'Login / access' },
  { value: 'OTHER', label: 'Other' },
];

export default function HelpRequestCard({ relatedRoute }: { relatedRoute?: string }) {
  const [issueType, setIssueType] = useState('PRODUCT_SETUP');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const whatsappHref = getSetupHelpHref();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setError(null);
    const res = await submitMerchantHelpRequestAction(issueType, message, relatedRoute);
    if (!res.success) {
      setStatus('error');
      setError(res.error ?? 'Could not send. Try WhatsApp instead.');
      return;
    }
    setStatus('sent');
    setMessage('');
  }

  return (
    <div className="card space-y-3 p-4 sm:p-6">
      <div>
        <h3 className="font-semibold text-ink">Need help?</h3>
        <p className="text-sm text-muted mt-1">
          Send a short message to Tish Group or chat on WhatsApp.{' '}
          <a href="/help" className="font-medium text-accent hover:underline">
            Browse guides
          </a>
        </p>
      </div>

      {status === 'sent' ? (
        <p className="text-sm text-success font-medium">
          Thanks — we received your message. Tish Group will follow up soon.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <select
            value={issueType}
            onChange={(e) => setIssueType(e.target.value)}
            className="input text-sm w-full"
          >
            {ISSUE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            required
            minLength={8}
            className="input text-sm w-full"
            placeholder="Describe what you need help with…"
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary text-sm" disabled={status === 'sending'}>
              {status === 'sending' ? 'Sending…' : 'Send to Tish Group'}
            </button>
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost border border-black/10 text-sm"
            >
              WhatsApp instead
            </a>
          </div>
        </form>
      )}
    </div>
  );
}
