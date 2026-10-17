import React from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SettingsSection from './SettingsSection';
afterEach(cleanup);
it('keeps saved and unsaved form values in a collapsed retained section', () => {
  const { container } = render(<form><SettingsSection title="Payment" keepMounted><label>Reference<input name="reference" defaultValue="Saved value" /></label></SettingsSection></form>);
  const section = screen.getByRole('button', { name: 'Payment' });
  expect(new FormData(container.querySelector('form')!).get('reference')).toBe('Saved value');
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  fireEvent.click(section);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Edited value' } });
  fireEvent.click(section);
  expect(new FormData(container.querySelector('form')!).get('reference')).toBe('Edited value');
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});
it('keeps other sections lazy unless form retention was requested', () => {
  render(<SettingsSection title="Reports"><p>Lazy content</p></SettingsSection>);
  expect(screen.queryByText('Lazy content')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reports' }));
  expect(screen.getByText('Lazy content')).toBeVisible();
});
