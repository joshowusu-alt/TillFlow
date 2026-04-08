'use server';

import { redirect } from 'next/navigation';
import { controlAuthConfigured, createControlSession, findOrBootstrapControlStaff, normalizeRole } from '@/lib/control-auth';

function readRequiredField(formData: FormData, name: string) {
  return String(formData.get(name) ?? '').trim();
}

export async function loginControlStaffAction(formData: FormData): Promise<void> {
  const email = readRequiredField(formData, 'email').toLowerCase();
  const accessKey = readRequiredField(formData, 'accessKey');

  if (!controlAuthConfigured()) {
    redirect('/login?error=CONTROL_PLANE_ACCESS_KEY is not configured for Tishgroup Control.');
  }

  if (!email || !accessKey) {
    redirect('/login?error=Email and access key are required.');
  }

  if (accessKey !== process.env.CONTROL_PLANE_ACCESS_KEY?.trim()) {
    redirect('/login?error=Invalid access key.');
  }

  try {
    const staff = await findOrBootstrapControlStaff(email);
    if (!staff) {
      redirect('/login?error=No active Control staff record exists for that email. Add the staff member first or set CONTROL_BOOTSTRAP_ADMIN_EMAIL for first-time access.');
    }

    if (!staff.active) {
      redirect('/login?error=This Control staff account is inactive.');
    }

    await createControlSession({
      id: staff.id,
      name: staff.name,
      email: staff.email,
      role: normalizeRole(staff.role),
    });
  } catch (error) {
    redirect(`/login?error=${encodeURIComponent(error instanceof Error ? error.message : 'Unable to sign in.')}`);
  }

  redirect('/');
}