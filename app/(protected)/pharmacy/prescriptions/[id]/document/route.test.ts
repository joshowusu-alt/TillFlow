import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ practitioner: vi.fn(), prescription: vi.fn(), context: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { pharmacyPractitioner: { findFirst: mocks.practitioner }, pharmacyPrescription: { findFirst: mocks.prescription } } }));
vi.mock('@/lib/action-utils', () => ({ withBusinessContext: mocks.context }));
import { GET } from './route';

describe('private prescription documents', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.context.mockResolvedValue({ businessId: 'business-a', user: { id: 'owner-a', role: 'OWNER' } });
  });
  it('does not grant an uncredentialled owner access to prescription bytes', async () => {
    mocks.practitioner.mockResolvedValue(null);
    expect((await GET(new Request('http://localhost'), { params: { id: 'rx' } })).status).toBe(403);
    expect(mocks.prescription).not.toHaveBeenCalled();
  });
  it('scopes every document lookup to the authenticated business', async () => {
    mocks.practitioner.mockResolvedValue({ id: 'professional' });
    mocks.prescription.mockResolvedValue(null);
    expect((await GET(new Request('http://localhost'), { params: { id: 'foreign-rx' } })).status).toBe(404);
    expect(mocks.prescription).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'foreign-rx', businessId: 'business-a' } }));
    expect(mocks.practitioner).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ businessId: 'business-a', userId: 'owner-a', active: true, registrationExpiresAt: { gt: expect.any(Date) } }) }));
  });
  it('returns a private, non-cacheable document with a fixed safe filename', async () => {
    mocks.practitioner.mockResolvedValue({ id: 'professional' });
    mocks.prescription.mockResolvedValue({ documentBody: Buffer.from('%PDF synthetic'), documentContentType: 'application/pdf' });
    const response = await GET(new Request('http://localhost'), { params: { id: 'rx' } });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(response.headers.get('Content-Disposition')).toBe('inline; filename="prescription"');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Content-Security-Policy')).toContain('sandbox');
    expect(await response.text()).toBe('%PDF synthetic');
  });
});
