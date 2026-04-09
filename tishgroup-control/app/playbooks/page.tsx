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
    <div className="space-y-6">
      <ControlPageHeader
        eyebrow="Operating playbooks"
        title="Make the team act the same way every time."
        description="This page is the operating contract behind the dashboard. Each runbook defines the trigger, owner, response window, and success signal so staff can hand accounts across the team without ambiguity."
        chips={playbooks.map((playbook) => ({ label: playbook.title, href: `#${playbook.key}` }))}
        stats={[
          { label: 'Core runbooks', value: String(playbooks.length), hint: 'Signup, due-soon, grace/fallback, and recovery are the mandatory control loops.' },
          { label: 'Fastest response', value: 'Immediate', hint: 'Read-only recovery should move as soon as commercial facts are confirmed.' },
          { label: 'Same-day escalations', value: '2', hint: 'Grace/fallback and read-only work should never sit in a passive queue.' },
          { label: 'Single source of truth', value: 'TG Control', hint: 'The dashboard and playbooks should point to the same commercial record and decisions.' },
        ]}
        aside={(
          <div className="space-y-5">
            <div>
              <div className="eyebrow">How to use this page</div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Runbooks should remove judgement drift</h2>
              <p className="mt-3 text-sm leading-7">
                If an operator opens a queue and is unsure what to do next, the page has already failed. These runbooks exist to keep actions consistent across teams and shifts.
              </p>
            </div>
          </div>
        )}
      />

      <section className="grid gap-6 xl:grid-cols-2">
        {playbooks.map((playbook) => (
          <div key={playbook.title} id={playbook.key} className="panel p-6">
            <h2 className="section-title text-control-ink">{playbook.title}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="control-callout">
                <div className="eyebrow">Trigger</div>
                <div className="mt-2 text-sm leading-6 text-black/66">{playbook.trigger}</div>
              </div>
              <div className="control-callout">
                <div className="eyebrow">Owner</div>
                <div className="mt-2 text-sm leading-6 text-black/66">{playbook.owner}</div>
              </div>
              <div className="control-callout">
                <div className="eyebrow">Response window</div>
                <div className="mt-2 text-sm leading-6 text-black/66">{playbook.targetWindow}</div>
              </div>
              <div className="control-callout">
                <div className="eyebrow">Success signal</div>
                <div className="mt-2 text-sm leading-6 text-black/66">{playbook.successSignal}</div>
              </div>
            </div>
            <p className="mt-3 rounded-2xl border border-black/8 bg-white/80 px-4 py-4 text-sm leading-6 text-black/64">
              {playbook.outcome}
            </p>
            <ul className="mt-5 space-y-3 text-sm leading-6 text-black/66">
              {playbook.bullets.map((bullet) => (
                <li key={bullet} className="rounded-2xl border border-black/8 bg-white/80 px-4 py-3">
                  {bullet}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}