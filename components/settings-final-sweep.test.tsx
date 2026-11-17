import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from '@/app/(protected)/settings/page';
import SettingsSection from './SettingsSection';
import OpeningBalancesForm from './OpeningBalancesForm';
import TillManagement from './TillManagement';
import HelpRequestCard from './help/HelpRequestCard';
import SendTestSummaryButton from '@/app/(protected)/settings/notifications/SendTestSummaryButton';
import MessageLogActions from '@/app/(protected)/settings/notifications/MessageLogActions';
const mocks = vi.hoisted(() => ({ cash: vi.fn(), ar: vi.fn(), ap: vi.fn(), till: vi.fn(), deactivate: vi.fn(), help: vi.fn(), send: vi.fn(), retry: vi.fn(), mark: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/settings', useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('@/app/actions/opening-balances', () => ({ saveCashBankOpeningBalances: mocks.cash, saveOpeningAR: mocks.ar, saveOpeningAP: mocks.ap }));
vi.mock('@/app/actions/settings', () => ({ updateBusinessAction: vi.fn(), createTillAction: mocks.till, deactivateTillAction: mocks.deactivate }));
vi.mock('@/app/actions/help-request', () => ({ submitMerchantHelpRequestAction: mocks.help }));
vi.mock('@/app/actions/notifications', () => ({ sendEodSummaryAction: mocks.send, retryNotificationAction: mocks.retry, markNotificationSentAction: mocks.mark }));
vi.mock('@/lib/auth', () => ({ requireBusiness: vi.fn() }));
vi.mock('@/lib/qz-signing.server', () => ({ isQzSigningConfigured: () => false }));
vi.mock('./CashDrawerSetup', () => ({ default: () => <div>Cash drawer setup</div> }));
vi.mock('./SubmitButton', () => ({ default: ({ children }: { children: React.ReactNode }) => <button type="submit">{children}</button> }));
vi.mock('@/lib/prisma', () => ({
  prisma: Object.fromEntries(['store', 'openingBalance', 'customer', 'supplier', 'salesInvoice', 'purchaseInvoice', 'journalEntry', 'till'].map(
    model => [model, { findMany: async () => [] }],
  )),
}));
import { requireBusiness } from '@/lib/auth';

beforeEach(() => { vi.clearAllMocks(); window.history.replaceState({}, '', '/settings'); });
afterEach(() => { window.history.replaceState({}, '', '/settings'); });
const props = { currencySymbol: 'GHS', customers: [{ id: 'c', name: 'Customer' }], suppliers: [{ id: 's', name: 'Supplier' }], openingBalances: [], arInvoices: [], apInvoices: [] };

describe('Business Settings disclosures', () => {
  const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalScroll) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScroll);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  });

  const titles = {
    profile: 'Business profile', printing: 'Receipts & label printing', tax: 'Tax registration',
    controls: 'Operations & risk controls', payments: 'Contacts & payments',
    'opening-capital': 'Opening balances', tills: 'Tills & drawers', 'help-and-more': 'Help & more settings',
  };

  async function renderSettings(role = 'OWNER') {
    vi.mocked(requireBusiness).mockResolvedValue({
      business: { id: 'business', name: 'Pubside', currency: 'GHS', vatEnabled: false },
      user: { role },
    } as Awaited<ReturnType<typeof requireBusiness>>);
    render(await SettingsPage({}));
  }

  it.each(['OWNER', 'MANAGER'])('renders closed native sections with the existing fields for %s', async role => {
    await renderSettings(role);
    const form = screen.getByRole('button', { name: 'Save settings' }).closest('form')!;
    const formData = new FormData(form);
    for (const [id, title] of Object.entries(titles)) {
      const section = document.querySelector<HTMLDetailsElement>(`details#${id}`);
      expect(section).not.toBeNull();
      expect(section).not.toHaveAttribute('open');
      expect(section?.querySelector('summary')).toHaveTextContent(title);
    }
    for (const name of ['name', 'labelPrinterName', 'vatNumber', 'discountApprovalThresholdPercent', 'phone']) {
      expect(formData.has(name)).toBe(true);
    }
    expect(formData.get('name')).toBe('Pubside');
    expect(document.querySelector('#label-printing')?.closest('details')?.id).toBe('printing');
    expect(form.querySelector('#opening-capital')).toBeNull();
  });

  it.each(['opening-capital', 'payments'])('opens %s on direct hash navigation', async id => {
    window.history.replaceState({}, '', '/settings#' + id);
    await renderSettings();
    expect(document.getElementById(id)).toHaveAttribute('open');
    expect(document.getElementById('profile')).not.toHaveAttribute('open');
  });

  it('reveals and scrolls to an invalid field inside a closed card', async () => {
    await renderSettings();
    const field = screen.getByLabelText('Discount approval threshold (%)');
    const scroll = vi.fn();
    field.scrollIntoView = scroll;
    fireEvent.change(field, { target: { value: '101' } });
    expect((field as HTMLInputElement).checkValidity()).toBe(false);
    expect(document.getElementById('controls')).toHaveAttribute('open');
    await waitFor(() => expect(scroll).toHaveBeenCalled());
  });
});

describe('section shortcuts', () => {
  it('opens a direct hash target and reopens it when the same shortcut is used again', () => {
    window.history.replaceState({}, '', '/settings#pickup');
    render(<><a href="#pickup">Jump to pickup</a><SettingsSection id="pickup" title="Pickup"><label>Hours<input /></label></SettingsSection></>);
    const toggle = screen.getByRole('button', { name: 'Pickup' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('link', { name: 'Jump to pickup' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Hours')).toBeVisible();
  });
  it('has a valid controlled region even before lazy content is opened', () => {
    render(<SettingsSection title="Lazy"><p>Contents</p></SettingsSection>);
    const toggle = screen.getByRole('button', { name: 'Lazy' });
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toHaveAttribute('hidden');
    expect(screen.queryByText('Contents')).not.toBeInTheDocument();
  });
});
describe('opening balances', () => {
  it('labels additional debt rows and keeps editing locked until the save completes', async () => {
    let finish!: (value: unknown) => void;
    mocks.cash.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<OpeningBalancesForm {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add customer' }));
    expect(screen.getByLabelText('Customer for opening debt 2')).toBeVisible();
    expect(screen.getByLabelText('Customer opening debt 2 amount (GHS)')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Save Cash & Bank' }));
    expect(screen.getByLabelText('Cash on Hand (GHS)')).toBeDisabled();
    await act(async () => { finish({ success: true }); });
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    expect(screen.getByLabelText('Cash on Hand (GHS)')).toBeEnabled();
  });
  it('recovers from a failed request instead of leaving controls locked', async () => {
    mocks.cash.mockRejectedValue(new Error('network'));
    render(<OpeningBalancesForm {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save Cash & Bank' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Bank Balance (GHS)')).toBeEnabled();
  });
});
it('shows a till deactivation failure and restores the labelled controls', async () => {
  mocks.deactivate.mockRejectedValue(new Error('network'));
  render(<TillManagement storeId="store" tills={[{ id: 'till', name: 'Till 1' }]} />);
  fireEvent.change(screen.getByLabelText('New till name'), { target: { value: 'Till 2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Deactivate Till 1' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not deactivate'));
  expect(screen.getByLabelText('New till name')).toBeEnabled();
});
it('recovers a support request after a network failure', async () => {
  mocks.help.mockRejectedValue(new Error('network'));
  render(<HelpRequestCard />);
  fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'Please help with settings' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send to Tish Group' }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('What do you need help with?')).toBeEnabled();
});
it('keeps test summary disabled until the mocked response completes', async () => {
  let finish!: (value: unknown) => void;
  mocks.send.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<SendTestSummaryButton whatsappAutomationConnected={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Send Test Summary' }));
  expect(screen.getByRole('button', { name: 'Sending...' })).toBeDisabled();
  await act(async () => { finish({ reason: 'disabled' }); });
  expect(screen.getByRole('status')).toHaveTextContent('Enable Daily Owner Summary');
});
it('locks both follow-up actions during retry and reports a rejected request', async () => {
  let fail!: (error: Error) => void;
  mocks.retry.mockImplementation(() => new Promise((_, reject) => { fail = reject; }));
  render(<MessageLogActions messageLogId="log" status="FAILED" providerStatus={null} deepLink="https://wa.me/1" deliveredAt={null} />);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(screen.getAllByRole('button').every(button => button.hasAttribute('disabled'))).toBe(true);
  await act(async () => { fail(new Error('network')); });
  expect(screen.getByRole('alert')).toHaveTextContent('Could not complete');
  expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
});

it('rejects empty cash balances and incomplete customer debts before saving', async () => {
  render(<OpeningBalancesForm {...props} />);
  fireEvent.change(screen.getByLabelText('Cash on Hand (GHS)'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Cash & Bank' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Use 0 for an empty balance');
  expect(mocks.cash).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Customer for opening debt 1'), { target: { value: 'c' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Customer Debts' }));
  expect(screen.getAllByRole('alert').some(el => el.textContent?.includes('Choose a customer'))).toBe(true);
  expect(mocks.ar).not.toHaveBeenCalled();
});
it('rejects negative supplier debt instead of silently omitting it', () => {
  render(<OpeningBalancesForm {...props} />);
  fireEvent.change(screen.getByLabelText('Supplier for opening debt 1'), { target: { value: 's' } });
  fireEvent.change(screen.getByLabelText('Supplier opening debt 1 amount (GHS)'), { target: { value: '-5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Supplier Debts' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Choose a supplier');
  expect(mocks.ap).not.toHaveBeenCalled();
});
