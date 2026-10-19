import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BarcodeScanInput from './BarcodeScanInput';
vi.mock('@/app/(protected)/pos/components/CameraScanner', () => ({ default: () => null }));
describe('physical scanner product entry', () => {
  it('retains leading zeros and prevents scanner Enter submitting the form', () => {
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(<form onSubmit={submit}><BarcodeScanInput name="barcode" /><button>Save</button></form>);
    const field = screen.getByRole('textbox', { name: /USB\/Bluetooth/ });
    fireEvent.change(field, { target: { value: '001234567890' } });
    expect(fireEvent.keyDown(field, { key: 'Enter', code: 'Enter' })).toBe(false);
    expect(field).toHaveValue('001234567890');
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Scan barcode with camera' })).toHaveAttribute('type', 'button');
  });
});
