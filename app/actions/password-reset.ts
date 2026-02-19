'use server';

import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { sendPasswordResetEmail } from '@/lib/email';
import { appLog } from '@/lib/observability';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Step 1: User enters their email on the forgot-password page.
 * We always show a success message (even if the email doesn't exist) to prevent email enumeration.
 */
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get('email') || '').trim().toLowerCase();

  if (!email) {
    redirect('/login/forgot-password?error=missing');
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, active: true },
    });

    if (user && user.active) {
      // Invalidate any existing unused tokens for this user
      await prisma.passwordResetToken.updateMany({
        where: { userId: user.id, used: false },
        data: { used: true },
      });

      // Create a new token
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

      await prisma.passwordResetToken.create({
        data: { token, userId: user.id, expiresAt },
      });

      // Build the reset URL
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000';
      const resetUrl = `${baseUrl}/login/reset-password?token=${token}`;

      const sent = await sendPasswordResetEmail(user.email, resetUrl, user.name || 'there');

      appLog('info', 'Password reset requested', {
        email,
        userId: user.id,
        emailSent: sent,
      });
    } else {
      // Log but don't reveal whether the email exists
      appLog('info', 'Password reset requested for unknown/inactive email', { email });
    }
  } catch (err) {
    appLog('error', 'Password reset request error', { error: String(err) });
  }

  // Always redirect to success — never reveal if email exists
  redirect('/login/forgot-password?success=1');
}

/**
 * Step 2: User clicks the email link and submits a new password.
 */
export async function completePasswordReset(formData: FormData) {
  const token = String(formData.get('token') || '').trim();
  const newPassword = String(formData.get('newPassword') || '');
  const confirmPassword = String(formData.get('confirmPassword') || '');

  if (!token) {
    redirect('/login/reset-password?error=invalid');
  }

  if (!newPassword || newPassword.length < 6) {
    redirect(`/login/reset-password?token=${token}&error=password_short`);
  }

  if (newPassword !== confirmPassword) {
    redirect(`/login/reset-password?token=${token}&error=mismatch`);
  }

  try {
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: { select: { id: true, name: true, businessId: true } } },
    });

    if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
      redirect('/login/reset-password?error=expired');
    }

    // Hash the new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update user's password & mark token as used in a transaction
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      }),
      // Invalidate all sessions so they must log in with the new password
      prisma.session.deleteMany({ where: { userId: resetToken.userId } }),
    ]);

    appLog('info', 'Password reset completed', {
      userId: resetToken.userId,
      userName: resetToken.user.name,
    });
  } catch (err: unknown) {
    // redirect() throws internally — re-throw those
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    appLog('error', 'Password reset completion error', { error: String(err) });
    redirect(`/login/reset-password?token=${token}&error=server`);
  }

  redirect('/login?success=password_reset');
}
