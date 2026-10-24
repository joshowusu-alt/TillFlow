import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireSelectedStoreContext } from '@/lib/action-utils';
import { accountBalance, holdingCode, ownerCode } from '@/lib/services/purchase-funding';
import { formatMoney, formatDateTime } from '@/lib/format';
import CashTransferForm from './CashTransferForm';

export default async function PurchaseCashPage(props: { searchParams?: Promise<{ storeId?: string }> }) {
  const searchParams = await props.searchParams;
  const { businessId, storeId: selectedStoreId } = await requireSelectedStoreContext(['OWNER', 'MANAGER'], searchParams?.storeId ?? '');
  const [business, people, shifts, entries] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { currency: true } }),
    prisma.user.findMany({ where: { businessId, role: { in: ['OWNER', 'MANAGER'] } }, select: { id: true, name: true, role: true } }),
    prisma.shift.findMany({ where: { status: 'OPEN', till: { storeId: selectedStoreId, active: true, store: { businessId } } }, select: { tillId: true, till: { select: { name: true } } } }),
    prisma.journalEntry.findMany({ where: { businessId, lines: { some: { account: { businessId, OR: [{ code: { startsWith: `1000.HOLD.${selectedStoreId}.` } }, { code: { startsWith: '2300.OWNER.' } }, { code: { startsWith: '3100.OWNER.' } }] } } } }, include: { lines: { include: { account: true } } }, orderBy: { entryDate: 'desc' }, take: 50 }),
  ]);
  const balances = await Promise.all(people.map(async person => ({ ...person, balance: await accountBalance(prisma, businessId, holdingCode(selectedStoreId, person.id)), owed: person.role === 'OWNER' ? -(await accountBalance(prisma, businessId, ownerCode(person.id, false))) : 0 })));
  return <div className="mx-auto max-w-3xl space-y-4"><Link className="underline" href={`/purchases?storeId=${selectedStoreId}`}>← Purchases</Link><h1 className="text-2xl font-semibold">Business cash held outside the till</h1><p>Record money handed to an owner or manager, then use that balance when paying suppliers.</p>
    <div className="card divide-y p-4">{balances.map(person => <div key={person.id} className="flex justify-between gap-4 py-3"><span>{person.name}</span><span className="text-right"><strong>{formatMoney(person.balance, business.currency)}</strong>{person.role === 'OWNER' ? <span className="block text-sm text-black/60">Owed to owner across business: {formatMoney(person.owed, business.currency)}</span> : null}</span></div>)}</div>
    <CashTransferForm storeId={selectedStoreId} people={people} tills={shifts.map(shift => ({ id: shift.tillId, name: shift.till.name }))} />
    <h2 className="text-lg font-semibold">Recent activity</h2>{entries.map(entry => <div key={entry.id} className="card p-4"><p className="font-medium">{entry.description}</p><p className="text-sm text-black/60">{formatDateTime(entry.entryDate)}</p>{entry.lines.filter(line => line.account.code.startsWith(`1000.HOLD.${selectedStoreId}.`) || line.account.code.startsWith('2300.OWNER.') || line.account.code.startsWith('3100.OWNER.')).map(line => <p key={line.id}>{line.account.name}: {formatMoney(line.debitPence - line.creditPence, business.currency)}</p>)}</div>)}
  </div>;
}
