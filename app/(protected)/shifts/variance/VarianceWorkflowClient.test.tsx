import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import VarianceWorkflowClient from './VarianceWorkflowClient';

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), review: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('@/app/actions/shifts', () => ({
  approveCashVarianceAction: vi.fn(), assignCashVarianceAction: vi.fn(),
  explainCashVarianceAction: vi.fn(), resolveCashVarianceAction: vi.fn(),
  markCashVarianceReviewedAction: mocks.review,
}));

const props = {
  investigationId: 'synthetic-variance', status: 'OPEN', cashierExplanation: 'Follow-up',
  originalReason: 'Counting error corrected', evidenceNote: null, managerResolution: null,
  assignedReviewerName: null, approvedByName: null, approvedAt: null,
  reviewers: [{ id: 'owner-a', name: 'Owner', role: 'OWNER' }], userRole: 'OWNER', canExplain: true,
};

describe('cash difference review controls', () => {
  it('shows the original reason and requires findings before closing', () => {
    render(<VarianceWorkflowClient {...props} />);
    expect(screen.getByText('Counting error corrected')).toBeVisible();
    const button = screen.getByRole('button', { name: 'Close review with findings' });
    expect(button).toBeDisabled();
    expect(screen.getByText('Enter your findings before closing the review.')).toBeVisible();
    fireEvent.change(screen.getByLabelText('What did you check and conclude?'), { target: { value: '  ' } });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText('What did you check and conclude?'), { target: { value: 'Verified the count and drawer entries.' } });
    expect(button).toBeEnabled();
  });

  it('does not offer review closure to cashiers or reopen approved cases', () => {
    const { rerender } = render(<VarianceWorkflowClient {...props} userRole="CASHIER" />);
    expect(screen.queryByRole('button', { name: 'Close review with findings' })).not.toBeInTheDocument();
    rerender(<VarianceWorkflowClient {...props} status="APPROVED" reviewedByName="Owner" />);
    expect(screen.getByText('Reviewed by Owner')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Close review with findings' })).not.toBeInTheDocument();
  });
});
