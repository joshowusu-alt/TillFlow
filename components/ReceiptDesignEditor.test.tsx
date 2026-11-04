import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReceiptDesignEditor, { type ReceiptDesignValues } from './ReceiptDesignEditor';

vi.mock('@/app/actions/receipt-design', () => ({ updateReceiptDesignAction: '/receipt-save-test' }));
vi.mock('@/components/SubmitButton', () => ({ default: ({ children }: { children: React.ReactNode }) => <button type="submit">{children}</button> }));
vi.mock('@/components/MerchantBrandBadge', () => ({ default: () => <span>Business logo</span> }));
const initialValues: ReceiptDesignValues = {
  address: 'Main Street', phone: '0240000000', receiptHeader: 'Welcome', receiptFooter: 'Thank you', receiptLogoUrl: '', socialMediaHandle: '@local', receiptShowAddress: true, receiptShowVatNumber: false, receiptShowStorefrontQr: false,
};
function editor(overrides: Partial<ReceiptDesignValues> = {}) {
  return render(<ReceiptDesignEditor initialValues={{ ...initialValues, ...overrides }} businessName="Local business" currency="GHS" vatNumber="VAT-1" merchantBranding={{ businessName: 'Local business', logoUrl: null, brandCompactLogoUrl: null, brandSquareLogoUrl: null }} storefrontEnabled={false} storefrontUrl={null} storefrontQrPreview={null} />);
}

describe('receipt design draft', () => {
  it('previews text and visibility changes before submitting', () => {
    editor();
    const preview = within(screen.getByRole('region', { name: 'Live preview' }));
    fireEvent.change(screen.getByLabelText('Receipt Header'), { target: { value: 'Fresh draft' } });
    expect(preview.getByText('Fresh draft')).toBeInTheDocument();
    expect(screen.getByText('Unsaved receipt changes')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Show VAT Number on receipts'));
    expect(preview.getByText('VAT: VAT-1')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Show Business Address on receipts'));
    expect(preview.queryByText('Main Street')).not.toBeInTheDocument();
  });

  it('discards the complete draft including checkboxes', () => {
    editor();
    fireEvent.change(screen.getByLabelText('Receipt Header'), { target: { value: 'Discard this' } });
    fireEvent.click(screen.getByLabelText('Show Business Address on receipts'));
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    const preview = within(screen.getByRole('region', { name: 'Live preview' }));
    expect(preview.getByText('Welcome')).toBeInTheDocument();
    expect(preview.getByText('Main Street')).toBeInTheDocument();
    expect(screen.getByText('Your saved receipt design')).toBeInTheDocument();
  });

  it('retains the saved QR preference when the storefront is unavailable', () => {
    const { container } = editor({ receiptShowStorefrontQr: true });
    const checkbox = screen.getByRole('checkbox', { name: /Show online store QR/ });
    expect(checkbox).toBeDisabled();
    expect(new FormData(container.querySelector('form')!).get('receiptShowStorefrontQr')).toBe('on');
  });
});
