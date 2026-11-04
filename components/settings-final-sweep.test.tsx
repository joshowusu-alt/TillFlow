import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsSection from './SettingsSection';
import OpeningBalancesForm from './OpeningBalancesForm';
import TillManagement from './TillManagement';
import HelpRequestCard from './help/HelpRequestCard';
import SendTestSummaryButton from '@/app/(protected)/settings/notifications/SendTestSummaryButton';
import MessageLogActions from '@/app/(protected)/settings/notifications/MessageLogActions';
const mocks = vi.hoisted(() => ({ cash: vi.fn(), ar: vi.fn(), ap: vi.fn(), till: vi.fn(), deactivate: vi.fn(), help: vi.fn(), send: vi.fn(), retry: vi.fn(), mark: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/settings', useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('@/app/actions/opening-balances', () => ({ saveCashBankOpeningBalances: mocks.cash, saveOpeningAR: mocks.ar, saveOpeningAP: mocks.ap }));
vi.mock('@/app/actions/settings', () => ({ createTillAction: mocks.till, deactivateTillAction: mocks.deactivate }));
vi.mock('@/app/actions/help-request', () => ({ submitMerchantHelpRequestAction: mocks.help }));
vi.mock('@/app/actions/notifications', () => ({ sendEodSummaryAction: mocks.send, retryNotificationAction: mocks.retry, markNotificationSentAction: mocks.mark }));
beforeEach(() => { vi.clearAllMocks(); window.history.replaceState({}, '', '/settings'); });
afterEach(() => { window.history.replaceState({}, '', '/settings'); });
const props = { currencySymbol: 'GHS', customers: [{ id: 'c', name: 'Customer' }], suppliers: [{ id: 's', name: 'Supplier' }], openingBalances: [], arInvoices: [], apInvoices: [] };

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
