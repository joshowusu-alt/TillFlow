import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const actions = vi.hoisted(() => ({ status: vi.fn(), request: vi.fn() }));
vi.mock('@/app/actions/pharmacy', () => ({ pharmacyCartStatusAction: actions.status, requestPharmacyReviewAction: actions.request }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }));
import PharmacyCheckout from './PharmacyCheckout';

const rule = { productId: 'medicine', productName: 'Synthetic medicine', medicineClass: 'PRESCRIPTION', minimumPatientAge: 18, checkInstructions: 'Check original' };
const initial = { success: true, data: { enabled: true, rules: [rule], review: null } };
const approved = { success: true, data: { enabled: true, rules: [rule], review: { id: 'review', status: 'APPROVED', expiresAt: new Date(Date.now() + 600000).toISOString(), batches: [{ id: 'allocation', productId: 'medicine', productName: 'Synthetic medicine', qtyBase: 1, batchId: 'batch', batch: { batchNumber: 'TEST-001', expiresAt: new Date('2099-01-01').toISOString() } }] } } };
const props = { storeId: 'branch', checkoutRef: 'POS_ONLINE:test', cartJson: JSON.stringify([{ productId: 'medicine', unitId: 'unit', qtyInUnit: 1 }]), signature: 'cart-one' };

describe('cashier dispensing confirmation', () => {
  beforeEach(() => { vi.resetAllMocks(); actions.status.mockResolvedValue(initial); actions.request.mockResolvedValue({ success: true, data: { id: 'review', status: 'APPROVED' } }); });
  it('requires physical batch confirmation and invalidates it when patient details change', async () => {
    const onChange = vi.fn();
    render(<PharmacyCheckout {...props} onChange={onChange} />);
    await screen.findByLabelText('Patient name');
    actions.status.mockResolvedValueOnce(approved);
    fireEvent.click(screen.getByRole('button', { name: 'Request pharmacist review' }));
    const physical = await screen.findByLabelText('I selected these exact physical batches for this sale.');
    expect(onChange).not.toHaveBeenLastCalledWith(expect.objectContaining({ ready: true }));
    fireEvent.click(physical);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ ready: true, confirmed: true, reviewId: 'review' }));
    fireEvent.change(screen.getByLabelText('Patient name'), { target: { value: 'Another patient' } });
    expect(onChange).toHaveBeenLastCalledWith({ signature: 'cart-one', ready: false });
    expect(screen.queryByLabelText('I selected these exact physical batches for this sale.')).not.toBeInTheDocument();
  });
  it('does not carry batch confirmation over to a changed cart', async () => {
    const onChange = vi.fn();
    const view = render(<PharmacyCheckout {...props} onChange={onChange} />);
    await screen.findByLabelText('Patient name');
    actions.status.mockResolvedValueOnce(approved);
    fireEvent.click(screen.getByRole('button', { name: 'Request pharmacist review' }));
    fireEvent.click(await screen.findByLabelText('I selected these exact physical batches for this sale.'));
    view.rerender(<PharmacyCheckout {...props} signature="cart-two" cartJson={JSON.stringify([{ productId: 'medicine', unitId: 'unit', qtyInUnit: 2 }])} onChange={onChange} />);
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ signature: 'cart-two', ready: false }));
    expect(screen.queryByLabelText('I selected these exact physical batches for this sale.')).not.toBeInTheDocument();
  });
  it('ignores a stale unrestricted response that arrives after the cart changes', async () => {
    let resolveOld!: (value: unknown) => void;
    actions.status.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    const onChange = vi.fn();
    const view = render(<PharmacyCheckout {...props} onChange={onChange} />);
    view.rerender(<PharmacyCheckout {...props} signature="cart-two" onChange={onChange} />);
    await screen.findByLabelText('Patient name');
    await act(async () => { resolveOld({ success: true, data: { enabled: false, rules: [], review: null } }); });
    expect(onChange).toHaveBeenLastCalledWith({ signature: 'cart-two', ready: false });
    expect(screen.getByLabelText('Patient name')).toBeInTheDocument();
  });
});
