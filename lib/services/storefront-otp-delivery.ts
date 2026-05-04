import { Resend } from 'resend';
import { sendStorefrontSms } from '@/lib/services/storefront-sms';

export type OtpDeliveryChannel = 'sms' | 'email' | 'console';

export type OtpDeliveryResult = {
  channel: OtpDeliveryChannel;
  /** Whether the OTP actually left this server. False for the dev/console fallback. */
  delivered: boolean;
  /** Only populated for the dev/console channel — never returned to the API client in prod. */
  devCode?: string;
};

type SendArgs = {
  storefrontName: string;
  phone: string;
  email: string | null;
  code: string;
  expiresInMinutes: number;
};

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || 'TillFlow <noreply@tillflow.com>';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function hasSmsProvider(): boolean {
  // Hubtel is the only configured provider today — keep this gate so we can
  // attempt SMS first, fall back to email second.
  return Boolean(process.env.HUBTEL_CLIENT_ID && process.env.HUBTEL_CLIENT_SECRET);
}

async function sendOtpViaSms(args: SendArgs): Promise<boolean> {
  const message = `${args.code} is your ${args.storefrontName} sign-in code. Expires in ${args.expiresInMinutes} minutes. Do not share this code.`;
  const result = await sendStorefrontSms({ to: args.phone, body: message });
  if (!result.ok) {
    console.warn('[storefront-otp] SMS send failed', result.error);
    return false;
  }
  return true;
}

async function sendViaEmail(args: SendArgs): Promise<boolean> {
  if (!resend || !args.email) return false;

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: args.email,
    subject: `Your ${args.storefrontName} sign-in code`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
        <p style="margin: 0 0 16px; font-size: 15px;">Hi,</p>
        <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6;">
          Use the code below to sign in to <strong>${args.storefrontName}</strong>:
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <div style="display: inline-block; font-family: 'SF Mono', Menlo, monospace; font-size: 32px; font-weight: 700; letter-spacing: 8px; padding: 16px 24px; background: #f3f4f6; border-radius: 12px;">
            ${args.code}
          </div>
        </div>
        <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px;">
          This code expires in ${args.expiresInMinutes} minutes. Don&apos;t share it with anyone.
        </p>
        <p style="margin: 0; color: #9ca3af; font-size: 12px;">
          If you didn&apos;t request this code you can safely ignore this email.
        </p>
      </div>
    `,
  });

  if (error) {
    console.warn('[storefront-otp] Resend email failed', error);
    return false;
  }
  return true;
}

/**
 * Deliver an OTP code via the best channel available in this environment.
 *
 * Order: SMS (if Hubtel keys present) → email (if Resend + customer email)
 * → dev console (logs the code so a developer can sign in locally).
 */
export async function deliverStorefrontOtp(args: SendArgs): Promise<OtpDeliveryResult> {
  if (hasSmsProvider()) {
    const ok = await sendOtpViaSms(args);
    if (ok) return { channel: 'sms', delivered: true };
    // SMS configured but failed — try email before falling through.
  }

  if (args.email && resend) {
    const ok = await sendViaEmail(args);
    if (ok) return { channel: 'email', delivered: true };
  }

  // Dev / staging fallback: log to server console so a developer can sign in.
  // Production should always have at least one of SMS or email configured.
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `[storefront-otp] No delivery channel configured — code for ${args.phone}: ${args.code}`,
    );
    return { channel: 'console', delivered: false, devCode: args.code };
  }

  console.error(
    '[storefront-otp] No SMS or email provider configured in production — OTP not delivered.',
  );
  return { channel: 'console', delivered: false };
}
