import type { ActivationReadinessStatus, ActivationStuckReason } from './activation-readiness';
import type { ActivationStepStatus } from './activation-steps';

/** Owner-facing labels — no technical jargon. */
export function getActivationStatusLabel(status: ActivationReadinessStatus): string {
  switch (status) {
    case 'GETTING_STARTED':
      return 'Getting started';
    case 'SETUP_IN_PROGRESS':
      return 'Setup in progress';
    case 'READY_TO_SELL':
      return 'Ready to sell';
    case 'ACTIVE_BUSINESS':
      return 'Active business';
    case 'NEEDS_HELP':
      return 'Needs help';
    case 'STUCK':
      return 'Stuck';
    default:
      return 'Setup in progress';
  }
}

export function getStuckReasonMessage(reason: ActivationStuckReason | null | undefined): string | null {
  if (!reason) return null;
  switch (reason) {
    case 'STUCK_NO_PRODUCTS':
      return 'Add your products so you can start selling.';
    case 'STUCK_NO_STOCK':
      return 'Add opening stock so TillFlow knows what you have.';
    case 'STUCK_NO_SALE':
      return 'Make your first sale to confirm the till is ready.';
    case 'STUCK_NO_REPORT':
      return 'Open your dashboard to see today’s sales and stock.';
    case 'STUCK_TRIAL_LOW_USAGE':
      return 'Your free trial is ending soon. Make a few more sales or contact us for setup help.';
    case 'PAYMENT_OVERDUE':
      return 'Your account needs payment to keep selling. Open Billing in Settings.';
    case 'SUPPORT_ISSUE_UNRESOLVED':
      return 'We are helping with your support request. Reply on WhatsApp if you need us.';
    case 'CHURN_RISK':
      return 'We noticed low activity. Open TillFlow or contact us if you need help.';
    default:
      return null;
  }
}

export function getStepStatusLabel(status: ActivationStepStatus): string {
  switch (status) {
    case 'done':
      return 'Done';
    case 'in_progress':
      return 'In progress';
    default:
      return 'Not started';
  }
}

export function getSetupHelpHref(): string {
  const phone = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP?.replace(/\D/g, '');
  if (phone) {
    return `https://wa.me/${phone}?text=${encodeURIComponent('Hi, I need help setting up TillFlow.')}`;
  }
  return '/settings/billing';
}

export function getSetupBannerCopy(input: {
  setupProgressPercent: number;
  activationStatus: ActivationReadinessStatus;
  stuckReason: ActivationStuckReason | null;
  ownerMessage: string;
}): { title: string; detail: string; cta: string } {
  const stuck = getStuckReasonMessage(input.stuckReason);
  if (stuck) {
    return {
      title: 'Start properly',
      detail: stuck,
      cta: input.setupProgressPercent > 0 ? 'Continue setup' : 'Begin setup',
    };
  }

  if (input.setupProgressPercent >= 100) {
    return {
      title: 'Start properly',
      detail: 'Finish the last setup step to close your checklist.',
      cta: 'Complete setup',
    };
  }

  const statusDetail =
    input.activationStatus === 'READY_TO_SELL'
      ? 'You are almost ready — make your first sale when you can.'
      : input.activationStatus === 'NEEDS_HELP'
        ? input.ownerMessage
        : `Business setup: ${input.setupProgressPercent}% complete.`;

  return {
    title: 'Start properly',
    detail: statusDetail,
    cta: input.setupProgressPercent > 0 ? 'Continue setup' : 'Begin setup',
  };
}
