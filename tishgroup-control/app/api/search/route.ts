import { NextResponse } from 'next/server';
import { getControlStaffOptional } from '@/lib/control-auth';
import { listManagedBusinesses } from '@/lib/control-service';

export const dynamic = 'force-dynamic';

/**
 * Lightweight server-side search for the global picker. Returns at
 * most 10 hits filtered by name / owner / phone. Auth is required so
 * the portfolio doesn't leak.
 *
 * Today this filters in-process over the cached business list; once
 * the portfolio crosses ~1000 records, swap the body for a Postgres
 * full-text query (gin index on name, owner, phone) — interface stays
 * the same.
 */
export async function GET(request: Request) {
  const staff = await getControlStaffOptional();
  if (!staff) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const rawQuery = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  if (rawQuery.length < 2) {
    return NextResponse.json({ ok: true, results: [] });
  }

  const businesses = await listManagedBusinesses();
  const phoneQuery = rawQuery.replace(/\s/g, '');
  const results = businesses
    .filter((b) => {
      const phone = b.ownerPhone.replace(/\s/g, '');
      return (
        b.name.toLowerCase().includes(rawQuery)
        || b.ownerName.toLowerCase().includes(rawQuery)
        || phone.includes(phoneQuery)
        || b.ownerPhone.includes(rawQuery)
      );
    })
    .slice(0, 10)
    .map((b) => ({
      id: b.id,
      name: b.name,
      ownerName: b.ownerName,
      ownerPhone: b.ownerPhone,
      plan: b.plan,
      state: b.state,
    }));

  return NextResponse.json({ ok: true, results });
}
