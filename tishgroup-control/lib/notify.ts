/**
 * Outbound notification helpers — Slack / email / SMS push when the
 * portfolio state changes (account hits GRACE / READ_ONLY, payment
 * lands, etc.). Today these helpers are stubs that log; wiring them to
 * real channels is gated on:
 *   - SLACK_WEBHOOK_URL  (incoming-webhook to the ops channel)
 *   - RESEND_API_KEY     (or any transactional-email provider)
 *   - SMS_GATEWAY_URL    (MoMo-friendly SMS gateway, e.g. Africa's Talking)
 *
 * Add the env vars in Vercel and replace the stub bodies. The call sites
 * in app/actions/control-businesses.ts already invoke these, so once the
 * env keys are present the alerts will start flowing without further
 * code changes in the action layer.
 */

export type StateTransitionPayload = {
  businessId: string;
  businessName: string;
  fromState: string;
  toState: string;
  monthlyValuePence: number;
  outstandingPence: number;
  triggeredBy: { name: string; email: string; role: string };
};

export type PaymentRecordedPayload = {
  businessId: string;
  businessName: string;
  amountPence: number;
  method: string;
  recordedBy: { name: string; email: string };
};

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL?.trim() || null;

async function postToSlack(payload: { text: string; blocks?: unknown }) {
  if (!SLACK_WEBHOOK_URL) {
    console.info('[notify] Slack webhook not configured, skipping', { text: payload.text });
    return;
  }
  try {
    await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('[notify] Slack post failed', error);
  }
}

export async function notifyStateTransition(payload: StateTransitionPayload): Promise<void> {
  if (payload.fromState === payload.toState) return;
  const escalating = ['GRACE', 'STARTER_FALLBACK', 'READ_ONLY'].includes(payload.toState);
  const recovered = payload.fromState === 'READ_ONLY' && payload.toState === 'ACTIVE';
  if (!escalating && !recovered) return;

  const verb = recovered ? 'recovered' : 'moved to';
  await postToSlack({
    text: `*${payload.businessName}* ${verb} *${payload.toState}* (was ${payload.fromState}). Triggered by ${payload.triggeredBy.name} (${payload.triggeredBy.role}).`,
  });
}

export async function notifyPaymentRecorded(payload: PaymentRecordedPayload): Promise<void> {
  await postToSlack({
    text: `:moneybag: *${payload.businessName}* paid GHc ${(payload.amountPence / 100).toLocaleString('en-GH')} via ${payload.method}, recorded by ${payload.recordedBy.name}.`,
  });
}
