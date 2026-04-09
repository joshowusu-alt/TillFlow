import SectionHeading from '@/components/section-heading';
import { requireControlStaff } from '@/lib/control-auth';

export const dynamic = 'force-dynamic';

const playbooks = [
  {
    title: 'Signup to first payment',
    bullets: [
      'Create the business record and assign an account manager.',
      'Set the sold plan, billing cadence, and first due date.',
      'Log the commercial promise made during demo or onboarding.',
    ],
  },
  {
    title: 'Due-soon handling',
    bullets: [
      'Send reminder before the due date, not after it.',
      'Confirm whether payment is MoMo, transfer, or invoice.',
      'Keep owner contact and preferred follow-up channel current.',
    ],
  },
  {
    title: 'Grace and fallback handling',
    bullets: [
      'Escalate the account the same day it enters grace.',
      'If fallback starts, warn the owner of the exact read-only date.',
      'If payment arrives, record it immediately so Tillflow restores access.',
    ],
  },
  {
    title: 'Read-only recovery',
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
      <section className="panel p-6">
        <SectionHeading
          eyebrow="Operating playbooks"
          title="Make the team act the same way every time"
          description="The control plane only works if Tishgroup pairs dashboard visibility with disciplined operating rules for signup, renewals, fallback, and recovery."
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        {playbooks.map((playbook) => (
          <div key={playbook.title} className="panel p-6">
            <h2 className="section-title text-control-ink">{playbook.title}</h2>
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