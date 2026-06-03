'use client';

import { useMemo, useState } from 'react';
import { applyTemplateVars, WHATSAPP_TEMPLATES, type WhatsAppTemplateVars } from '@/lib/vendor/whatsapp-templates';

type Props = {
  defaultVars: WhatsAppTemplateVars;
};

export default function WhatsAppTemplatesView({ defaultVars }: Props) {
  const [vars, setVars] = useState<WhatsAppTemplateVars>(defaultVars);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof WHATSAPP_TEMPLATES>();
    for (const t of WHATSAPP_TEMPLATES) {
      if (!map.has(t.category)) map.set(t.category, []);
      map.get(t.category)!.push(t);
    }
    return map;
  }, []);

  async function copyText(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setCopiedId(null);
    }
  }

  return (
    <div className="space-y-8">
      <section className="card p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs">
          <span className="text-control-muted">Business</span>
          <input
            className="input mt-1 w-full text-sm"
            value={vars.businessName ?? ''}
            onChange={(e) => setVars((v) => ({ ...v, businessName: e.target.value }))}
          />
        </label>
        <label className="text-xs">
          <span className="text-control-muted">Owner</span>
          <input
            className="input mt-1 w-full text-sm"
            value={vars.ownerName ?? ''}
            onChange={(e) => setVars((v) => ({ ...v, ownerName: e.target.value }))}
          />
        </label>
        <label className="text-xs">
          <span className="text-control-muted">Agent</span>
          <input
            className="input mt-1 w-full text-sm"
            value={vars.agentName ?? ''}
            onChange={(e) => setVars((v) => ({ ...v, agentName: e.target.value }))}
          />
        </label>
        <label className="text-xs">
          <span className="text-control-muted">Plan</span>
          <input
            className="input mt-1 w-full text-sm"
            value={vars.plan ?? ''}
            onChange={(e) => setVars((v) => ({ ...v, plan: e.target.value }))}
          />
        </label>
        <label className="text-xs">
          <span className="text-control-muted">Trial end</span>
          <input
            className="input mt-1 w-full text-sm"
            value={vars.trialEndDate ?? ''}
            onChange={(e) => setVars((v) => ({ ...v, trialEndDate: e.target.value }))}
          />
        </label>
        <label className="text-xs">
          <span className="text-control-muted">Amount</span>
          <input
            className="input mt-1 w-full text-sm"
            value={vars.amount ?? ''}
            onChange={(e) => setVars((v) => ({ ...v, amount: e.target.value }))}
          />
        </label>
      </section>

      {Array.from(grouped.entries()).map(([category, templates]) => (
        <section key={category}>
          <h2 className="text-sm font-display font-bold capitalize text-control-ink">{category}</h2>
          <div className="mt-3 grid gap-3">
            {templates.map((tpl) => {
              const body = applyTemplateVars(tpl.body, vars);
              return (
                <article key={tpl.id} className="card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-semibold text-control-ink">{tpl.title}</h3>
                    <button
                      type="button"
                      onClick={() => copyText(tpl.id, body)}
                      className="btn-secondary text-xs py-1.5"
                    >
                      {copiedId === tpl.id ? 'Copied' : 'Copy message'}
                    </button>
                  </div>
                  <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-control-surface/60 p-3 text-xs leading-relaxed text-control-ink">
                    {body}
                  </pre>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
