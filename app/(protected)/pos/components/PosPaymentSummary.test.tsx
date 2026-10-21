import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import PosPaymentSummary from './PosPaymentSummary';
it('shows change even at zero, updates to the actual amount and preserves full currency values', () => {
  const props = { currency: 'GHS', totalDue: 13900, changeDue: 0, hasCash: true, balanceRemaining: 0 };
  const { rerender } = render(<PosPaymentSummary {...props} />);
  expect(screen.getByText('Change to give')).toBeInTheDocument(); expect(screen.getByText('GH₵0.00')).toBeInTheDocument();
  rerender(<PosPaymentSummary {...props} changeDue={6100} />); expect(screen.getByText('GH₵61.00')).toBeInTheDocument();
  rerender(<PosPaymentSummary {...props} changeDue={123456789} />); expect(screen.getByText('GH₵1,234,567.89')).toBeInTheDocument();
});
it('shows an unpaid balance without implying a noncash sale has cash change', () => {
  render(<PosPaymentSummary currency="GHS" totalDue={13900} changeDue={0} hasCash={false} balanceRemaining={3900} />);
  expect(screen.getByText('Still to pay')).toBeInTheDocument(); expect(screen.getByText('GH₵39.00')).toBeInTheDocument(); expect(screen.queryByText('Change to give')).not.toBeInTheDocument();
});
