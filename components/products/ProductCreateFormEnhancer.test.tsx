import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProductCreateFormEnhancer from '@/components/products/ProductCreateFormEnhancer';

function renderForm(createAction: (formData: FormData) => void | Promise<void>) {
  return render(
    <ProductCreateFormEnhancer createAction={createAction} currencySymbol="GH₵" units={[]} includeOpeningStock={false}>
      <label>
        Name
        <input name="name" defaultValue="Rice" />
      </label>
    </ProductCreateFormEnhancer>,
  );
}

describe('ProductCreateFormEnhancer save errors', () => {
  it('shows an alert when create fails without navigating', async () => {
    const createAction = vi.fn().mockRejectedValue(new Error('P2003 foreign key'));
    const view = renderForm(createAction);
    fireEvent.submit(view.container.querySelector('form')!);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/could not save this product/i);
    });
    expect(createAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/P2003/)).not.toBeInTheDocument();
  });

  it('rethrows a redirect so a successful save can leave the form', async () => {
    const redirectError = new Error('NEXT_REDIRECT');
    (redirectError as Error & { digest: string }).digest = 'NEXT_REDIRECT;replace;/products?created=1;303;';
    const createAction = vi.fn().mockRejectedValue(redirectError);
    const view = renderForm(createAction);

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    fireEvent.submit(view.container.querySelector('form')!);

    await waitFor(() => {
      expect(createAction).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(unhandled).toContain(redirectError);
    });
    process.off('unhandledRejection', onUnhandled);
  });
});
