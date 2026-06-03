'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import type { ControlDigestData, DigestActionRow, DigestBucket } from '@/lib/control-digest/types';
import { whatsappHref } from '@/lib/scale-cockpit/labels';

type Props = {
  data: ControlDigestData;
};

function priorityBadge(priority: DigestActionRow['priority']) {
  const styles =
    priority === 'critical'
      ? 'bg-rose-100 text-rose-800'
      : priority === 'high'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-slate-100 text-slate-700';
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${styles}`}>{priority}</span>
  );
}

function ActionCard({ row }: { row: DigestActionRow }) {
  const wa = whatsappHref(row.ownerPhone, `Hi ${row.ownerName}, this is Tish Group — ${row.reason}. ${row.nextAction}`);
  const tel = row.ownerPhone.replace(/[^\d+]/g, '');

  return (
    <div className="rounded-xl border border-control-line bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-control-ink truncate">{row.businessName}</p>
          <p className="text-xs text-control-muted">{row.ownerName}</p>
        </div>
        {priorityBadge(row.priority)}
      </div>
      <p className="mt-2 text-sm text-control-ink">{row.reason}</p>
      <p className="mt-1 text-xs text-control-muted">Next: {row.nextAction}</p>
      <p className="mt-1 text-xs text-control-muted">Agent: {row.assignedAgent}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className="min-h-[40px] rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
          >
            WhatsApp
          </a>
        ) : null}
        {tel ? (
          <a href={`tel:${tel}`} className="min-h-[40px] rounded-lg border border-control-line px-3 py-2 text-xs font-semibold">
            Call
          </a>
        ) : null}
        <Link
          href={`/command/scale?businessId=${encodeURIComponent(row.businessId)}`}
          className="min-h-[40px] rounded-lg border border-control-line px-3 py-2 text-xs font-semibold"
        >
          Open business
        </Link>
        <Link
          href={`/businesses/${row.businessId}`}
          className="min-h-[40px] rounded-lg border border-control-line px-3 py-2 text-xs font-semibold text-control-muted"
        >
          Note
        </Link>
      </div>
    </div>
  );
}

function BucketSection({ bucket }: { bucket: DigestBucket }) {
  if (bucket.count === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-control-ink">{bucket.label}</h2>
        <span className="text-xs text-control-muted">{bucket.count}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {bucket.rows.map((row) => (
          <ActionCard key={`${row.businessId}-${row.reason}`} row={row} />
        ))}
      </div>
    </section>
  );
}

function StatChip({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-control-line bg-white p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-control-muted">{label}</p>
      <p className="mt-1 text-xl font-display font-bold text-control-ink">{value}</p>
    </div>
  );
}

export default function ControlDigestView({ data }: Props) {
  const [copied, setCopied] = useState(false);

  const copyDigest = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(data.whatsappText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }, [data.whatsappText]);

  const { counts, weekly } = data;

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <StatChip label="New today" value={counts.newSignupsToday} />
        <StatChip label="Stuck setup" value={counts.stuckSetup} />
        <StatChip label="Trial ends today" value={counts.trialsEndingToday} />
        <StatChip label="Overdue" value={counts.overdue} />
        <StatChip label="Critical support" value={counts.openCriticalSupport} />
        <StatChip label="Collections (wk)" value={`GHS ${counts.expectedCollectionsThisWeek.toLocaleString()}`} />
        <StatChip label="Paid this week" value={counts.paidThisWeek} />
        <StatChip label="Healthy" value={counts.healthy} />
      </div>

      <section className="rounded-2xl border border-control-line bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold">WhatsApp summary</h2>
          <button
            type="button"
            onClick={copyDigest}
            className="min-h-[44px] rounded-xl bg-control-accent px-4 py-2 text-sm font-semibold text-white"
          >
            {copied ? 'Copied' : 'Copy digest'}
          </button>
        </div>
        <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-control-ink font-mono leading-relaxed overflow-x-hidden">
          {data.whatsappText}
        </pre>
      </section>

      <section className="rounded-2xl border border-control-line bg-white p-4 space-y-2">
        <h2 className="text-sm font-bold">Weekly rollout progress</h2>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <p>
            <span className="text-control-muted">Onboarded: </span>
            <span className="font-semibold">{weekly.onboardedThisWeek}</span>
          </p>
          <p>
            <span className="text-control-muted">Trials started: </span>
            <span className="font-semibold">{weekly.trialsStarted}</span>
          </p>
          <p>
            <span className="text-control-muted">Demos booked: </span>
            <span className="font-semibold">{weekly.demosBooked}</span>
          </p>
          <p>
            <span className="text-control-muted">Demos completed: </span>
            <span className="font-semibold">{weekly.demosCompleted}</span>
          </p>
          <p>
            <span className="text-control-muted">Paid conversions: </span>
            <span className="font-semibold">{weekly.paidConversions}</span>
          </p>
          <p>
            <span className="text-control-muted">First sales: </span>
            <span className="font-semibold">{weekly.firstSaleThisWeek}</span>
          </p>
          <p>
            <span className="text-control-muted">Setup completed: </span>
            <span className="font-semibold">{weekly.setupCompletedThisWeek}</span>
          </p>
          <p>
            <span className="text-control-muted">Active weekly: </span>
            <span className="font-semibold">{weekly.activeWeekly}</span>
          </p>
          <p>
            <span className="text-control-muted">Support opened: </span>
            <span className="font-semibold">{weekly.supportOpened}</span>
          </p>
          <p>
            <span className="text-control-muted">Support resolved: </span>
            <span className="font-semibold">{weekly.supportResolved}</span>
          </p>
          <p>
            <span className="text-control-muted">Expected MRR: </span>
            <span className="font-semibold">GHS {weekly.expectedMrr.toLocaleString()}</span>
          </p>
          <p>
            <span className="text-control-muted">Collections next wk: </span>
            <span className="font-semibold">GHS {weekly.collectionsExpectedNextWeek.toLocaleString()}</span>
          </p>
        </div>
        {weekly.topSources.length > 0 ? (
          <div className="pt-2 text-xs text-control-muted">
            Top sources:{' '}
            {weekly.topSources.map((s) => `${s.label} (${s.count})`).join(' · ')}
          </div>
        ) : null}
        {weekly.topAgents.length > 0 ? (
          <div className="text-xs text-control-muted">
            Top agents: {weekly.topAgents.map((a) => `${a.agent} (${a.count})`).join(' · ')}
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold">Today&apos;s priorities</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {data.priorities.slice(0, 30).map((row) => (
            <ActionCard key={`${row.businessId}-${row.category}-${row.reason}`} row={row} />
          ))}
        </div>
        {data.priorities.length === 0 ? (
          <p className="text-sm text-control-muted">No urgent actions — check healthy businesses below.</p>
        ) : null}
      </section>

      {data.buckets.map((bucket) => (
        <BucketSection key={bucket.key} bucket={bucket} />
      ))}

      <p className="text-xs text-control-muted">
        Generated {new Date(data.generatedAt).toLocaleString()}. Uses setup progress, billing, support, and referral data
        from Scale Cockpit (excludes demo businesses).
      </p>
    </div>
  );
}
