import { expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ put: vi.fn().mockResolvedValue(undefined) }));
vi.mock('idb', () => ({ openDB: vi.fn().mockResolvedValue(db) }));
import { updateOfflineSale, type OfflineSale } from './storage';
import { OFFLINE_QUEUE_CHANGED } from './queue-events';
it('updates offline counters only after a successful local write, without network requests', async () => {
  const notify = vi.fn(); window.addEventListener(OFFLINE_QUEUE_CHANGED, notify);
  try {
    await updateOfflineSale({ id: 'pending' } as OfflineSale);
    expect(notify).toHaveBeenCalledOnce();
    db.put.mockRejectedValueOnce(new Error('Disk full'));
    await expect(updateOfflineSale({ id: 'failed' } as OfflineSale)).rejects.toThrow('Disk full');
    expect(notify).toHaveBeenCalledOnce();
  } finally { window.removeEventListener(OFFLINE_QUEUE_CHANGED, notify); }
});
