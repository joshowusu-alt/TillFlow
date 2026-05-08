import { NextResponse } from 'next/server';
import { hasValidCronSecret } from '@/lib/cron-auth';
import { enqueueDueSubscriptionReminders } from '@/lib/subscription-reminders';

export async function GET(request: Request) {
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await enqueueDueSubscriptionReminders();
  return NextResponse.json({ ok: true, ...result });
}
