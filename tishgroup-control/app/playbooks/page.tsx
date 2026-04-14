import ControlPageHeader from '@/components/control-page-header';
import SectionHeading from '@/components/section-heading';
import { requireControlStaff } from '@/lib/control-auth';

export const dynamic = 'force-dynamic';

const playbooks = [
  {
    key: 'signup',
    title: 'Signup to first payment',
    trigger: 'A new business is created or handed over from onboarding.',
    owner: 'Account manager',
    targetWindow: 'Same day',
    successSignal: 'The business is assigned, reviewed, and billed on the correct commercial plan.',
    outcome: 'Convert a new business into a clean commercial record with the right owner and plan from day one.',
    bullets: [
      'Create the business record and assign an account manager.',
      'Set the sold plan, billing cadence, and first due date.',
      'Log the commercial promise made during demo or onboarding.',
    ],
  },
  {
    key: 'due-soon',
    title: 'Due-soon handling',
    trigger: 'The business is approaching its next due date.',
    owner: 'Collections or account manager',
    targetWindow: 'Within 24 hours',
    successSignal: 'Payment method and follow-up path are confirmed before overdue handling begins.',
    outcome: 'Keep payment prompts proactive so the team is not chasing preventable overdue accounts.',
    bullets: [
      'Send reminder before the due date, not after it.',
      'Confirm whether payment is MoMo, transfer, or invoice.',
      'Keep owner contact and preferred follow-up channel current.',
    ],
  },
  {
    key: 'grace',
    title: 'Grace and fallback handling',
    trigger: 'The business moves into grace or loses full feature access.',
    owner: 'Collections lead',
    targetWindow: 'Same day',
    successSignal: 'The owner understands the exact restriction timeline and the account has an explicit recovery path.',
    outcome: 'Escalate immediately and make the consequences explicit before the account reaches read-only.',
    bullets: [
      'Escalate the account the same day it enters grace.',
      'If fallback starts, warn the owner of the exact read-only date.',
      'If payment arrives, record it immediately so Tillflow restores access.',
    ],
  },
  {
    key: 'recovery',
    title: 'Read-only recovery',
    trigger: 'Payment is claimed or the account requires a restore decision.',
    owner: 'Collections or control admin',
    targetWindow: 'Immediate',
    successSignal: 'Payment is recorded, the next due date is reset, and access matches the sold plan again.',
    outcome: 'Restore the business fast, but only after the commercial facts are confirmed and recorded properly.',
    bullets: [
      'Confirm whether the business has actually paid before restoring.',
      'Record the payment, set the next due date, and check that access is back to the sold plan.',
      'Add a note explaining why the account reached read-only in the first place.',
    ],
  },
];

export default async function PlaybooksPage() {
  await requireControlStaff();
  return (
    <div className="space-y-4 lg:space-y-5">
      <ControlPageHeader
        eyebrow="Operating playbooks"
        title="Operational runbooks, not policy memos."
        description="Each runbook defines the trigger, owner, response window, success signal, and action steps so staff can move the same way every time."
        chips={playbooks.map((playbook) => ({ label: playbook.title, href: `#${playbook.key}` }))}
        stats={[
          { label: 'Core runbooks', value: String(playbooks.length), hint: 'The four mandatory control loops.' },
          { label: 'Fastest response', value: 'Immediate', hint: 'Recovery work should move as soon as payment is confirmed.' },
          { label: 'Same-day escalations', value: '2', hint: 'Grace/fallback and recovery should not sit in a passive queue.' },
          { label: 'Single source', value: 'TG Control', hint: 'Runbooks and the dashboard point to the same commercial record.' },
        ]}
        aside={(
          <div className="space-y-4">
            <div>
              <div className="eyebrow">How to use this page</div>
              <h2 className="mt-1.5 text-xl font-semibold tracking-tight">Runbooks should remove judgement drift</h2>
            </div>
            <div className="rounded-[18px] border border-white/10 bg-white/6 px-3.5 py-3 text-sm leading-6 text-white/74">
              Trigger first, owner second, response window third, success signal last. If the next move is unclear, the runbook needs work.
            </div>
          </div>
        )}
      />

      <section className="grid gap-4 xl:grid-cols-2">
        {playbooks.map((playbook) => (
          <div key={playbook.title} id={playbook.key} className="control-runbook-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="eyebrow">Runbook</div>
                <h2 className="mt-1.5 text-lg font-semibold tracking-tight text-control-ink">{playbook.title}</h2>
              </div>
              <span className="inline-flex rounded-full border border-black/8 bg-black/[0.03] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-black/50">
                {playbook.targetWindow}
              </span>
            </div>

            <div className="mt-4 control-runbook-grid">
              <div className="control-runbook-field">
                <div className="eyebrow">Trigger</div>
                <div className="mt-2 text-sm leading-6 text-black/66">{playbook.trigger}</div>
              </div>
              <div className="control-runbook-field">
                <div className="eyebrow">Owner</div>
                <div className="mt-2 text-sm leading-6 text-black/66">{playbook.owner}</div>
              </div>
              <div className="control-runbook-field">
                <div className="eyebrow">Response window</div>
                <div className="mt-2 text-sm leading-6 text-black/66">{playbook.targetWindow}</div>
              </div>
              <div className="control-runbook-field">
                <div className="eyebrow">Success signal</div>
                <div className="mt-2 text-sm leading-6 text-black/66">{playbook.successSignal}</div>
              </div>
            </div>

            <div className="mt-4">
              <div className="eyebrow">Action steps</div>
              <div className="control-checklist mt-3 space-y-2.5">
                {playbook.bullets.map((bullet) => (
                  <div key={bullet} className="control-checklist-item">
                    <div className="text-sm leading-6 text-black/66">{bullet}</div>
                  </div>
                ))}
              </div>
            </div>

            <details className="control-disclosure mt-4">
              <summary>Operating intent</summary>
              <div className="control-disclosure-content">{playbook.outcome}</div>
            </details>
          </div>
        ))}
      </section>
    </div>
  );
}
