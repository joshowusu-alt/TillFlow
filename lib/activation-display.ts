import type { ActivationReadinessStatus, ActivationStuckReason } from './activation-readiness';
import type { ActivationStepStatus } from './activation-steps';
import type { OnboardingJourneyStatus } from './onboarding-journey';
import { getOnboardingJourneyStatusLabel } from './onboarding-journey';

/** Owner-facing labels — Phase 1 four statuses. */
export function getActivationStatusLabel(status: ActivationReadinessStatus): string {
  switch (status) {
    case 'GETTING_STARTED':
    case 'SETUP_IN_PROGRESS':
      return getOnboardingJourneyStatusLabel('GETTING_READY');
    case 'READY_TO_SELL':
      return getOnboardingJourneyStatusLabel('READY_TO_SELL');
    case 'ACTIVE_BUSINESS':
      return getOnboardingJourneyStatusLabel('IMPROVING_RECORDS');
    case 'NEEDS_HELP':
      return 'Needs attention';
    case 'STUCK':
      // Should not appear in owner UX after Phase 1.
      return getOnboardingJourneyStatusLabel('GETTING_READY');
    default:
      return getOnboardingJourneyStatusLabel('GETTING_READY');
  }
}

export function getJourneyStatusLabelFromActivation(
  status: ActivationReadinessStatus
): OnboardingJourneyStatus {
  switch (status) {
    case 'READY_TO_SELL':
      return 'READY_TO_SELL';
    case 'ACTIVE_BUSINESS':
      return 'IMPROVING_RECORDS';
    default:
      return 'GETTING_READY';
  }
}

export function getStuckReasonMessage(reason: ActivationStuckReason | null | undefined): string | null {
  if (!reason) return null;
  // Only billing/support messages reach owner surfaces.
  switch (reason) {
    case 'PAYMENT_OVERDUE':
      return 'Your account needs payment to keep selling. Open Billing.';
    case 'SUPPORT_ISSUE_UNRESOLVED':
      return 'We are helping with your support request. Reply on WhatsApp if you need us.';
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
      title: 'Account needs attention',
      detail: stuck,
      cta: 'Open setup',
    };
  }

  if (input.activationStatus === 'READY_TO_SELL') {
    return {
      title: 'Ready to sell',
      detail: 'Open POS and make your first successful sale when you can.',
      cta: 'Start selling',
    };
  }

  if (input.activationStatus === 'ACTIVE_BUSINESS') {
    return {
      title: 'First sale complete',
      detail: 'Improve your records anytime — staff, stock, and reports stay optional.',
      cta: 'Open setup',
    };
  }

  return {
    title: 'Getting ready',
    detail: input.ownerMessage || 'Tell us about your business, add what you sell, then start selling.',
    cta: input.setupProgressPercent > 0 ? 'Continue setup' : 'Begin setup',
  };
}
