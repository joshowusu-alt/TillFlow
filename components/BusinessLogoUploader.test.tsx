import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BusinessLogoUploader from './BusinessLogoUploader';

const refreshMock = vi.fn();
const fetchMock = vi.fn();
const createObjectUrlMock = vi.fn(() => 'blob:preview-logo');
const revokeObjectUrlMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

describe('BusinessLogoUploader', () => {
  beforeEach(() => {
    refreshMock.mockReset();
    fetchMock.mockReset();
    createObjectUrlMock.mockClear();
    revokeObjectUrlMock.mockClear();
    global.fetch = fetchMock as typeof fetch;
    URL.createObjectURL = createObjectUrlMock;
    URL.revokeObjectURL = revokeObjectUrlMock;
  });

  it('shows a local preview and waits for confirmation before uploading', () => {
    const { container } = render(
      <BusinessLogoUploader initialLogoUrl={null} businessName="El-Shaddai Supermarket" />,
    );

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const file = new File(['logo'], 'shop-logo.png', { type: 'image/png' });
    fireEvent.change(fileInput as HTMLInputElement, { target: { files: [file] } });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('Preview ready to confirm')).toBeInTheDocument();
    expect(screen.getByText('Selected: shop-logo.png. Confirm to make this logo live.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm logo' })).toBeInTheDocument();
  });

  it('uploads only after confirmation and refreshes the page', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ logoUrl: 'https://blob.vercel-storage.com/business-logos/new-logo.png' }),
    } satisfies Partial<Response>);

    const { container } = render(
      <BusinessLogoUploader
        initialLogoUrl="https://cdn.example.com/live-logo.png"
        businessName="El-Shaddai Supermarket"
      />,
    );

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const file = new File(['logo'], 'replacement.png', { type: 'image/png' });
    fireEvent.change(fileInput as HTMLInputElement, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm logo' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/settings/business-logo', expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
    }));
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:preview-logo');
    expect(screen.getByText('Your logo is live')).toBeInTheDocument();
  });
});
