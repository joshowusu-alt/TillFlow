import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || 'TillFlow <noreply@tillflow.com>';

/**
 * Send a password-reset email with a one-time link.
 * Returns true if sent successfully, false if email delivery is not configured.
 */
export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
  userName: string
): Promise<boolean> {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping email delivery');
    return false;
  }

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: 'Reset your TillFlow password',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="font-size: 24px; font-weight: 700; margin: 0;">
            <span style="color: #6366f1;">Till</span><span style="color: #1f2937;">Flow</span>
          </h1>
        </div>
        <div style="background: #f9fafb; border-radius: 12px; padding: 24px; border: 1px solid #e5e7eb;">
          <p style="margin: 0 0 8px; font-size: 16px; font-weight: 600;">Hi ${userName},</p>
          <p style="margin: 0 0 16px; color: #6b7280; font-size: 14px; line-height: 1.6;">
            Someone requested a password reset for your TillFlow account. Click the button below to choose a new password.
          </p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${resetUrl}" style="display: inline-block; background: #6366f1; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
              Reset Password
            </a>
          </div>
          <p style="margin: 0; color: #9ca3af; font-size: 12px; line-height: 1.5;">
            This link expires in 1 hour. If you didn&apos;t request this, you can safely ignore this email — your password will not change.
          </p>
        </div>
        <p style="margin: 16px 0 0; text-align: center; color: #d1d5db; font-size: 11px;">
          TillFlow — Sales made simple
        </p>
      </div>
    `,
  });

  if (error) {
    console.error('[email] Failed to send password reset email:', error);
    return false;
  }

  return true;
}
