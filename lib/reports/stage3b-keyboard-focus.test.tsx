import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReportKeyboardFocus from '@/components/reports/stage3b/ReportKeyboardFocus';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function setup(bottom: number, barTop = 763) {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  render(<><div data-reports-focus-scope><ReportKeyboardFocus /><button>Report control</button></div><button>Outside report</button><div className="mobile-bottom-tab-bar" /></>);
  const button = screen.getByRole('button', { name: 'Report control' });
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({ top: bottom - 44, bottom, height: 44 } as DOMRect);
  vi.spyOn(button, 'matches').mockImplementation(selector => selector === ':focus-visible');
  vi.spyOn(document.querySelector('.mobile-bottom-tab-bar')!, 'getBoundingClientRect').mockReturnValue({ top: barTop, height: barTop ? 81 : 0 } as DOMRect);
  const scroll = vi.fn();
  button.scrollIntoView = scroll;
  return { button, scroll };
}

describe('Stage 3B keyboard focus clearance', () => {
  it('corrects a keyboard-focused control hidden behind the phone bar', () => {
    const { button, scroll } = setup(880);
    fireEvent.keyDown(document, { key: 'Tab' }); button.focus();
    expect(scroll).toHaveBeenCalledWith({ block: 'center', inline: 'nearest', behavior: 'instant' });
  });

  it('corrects a control clipped by the desktop viewport without a bar', () => {
    const { button, scroll } = setup(innerHeight + 4, 0);
    fireEvent.keyDown(document, { key: 'Tab' }); button.focus();
    expect(scroll).toHaveBeenCalledOnce();
  });

  it('leaves a fully visible keyboard target in place', () => {
    const { button, scroll } = setup(300);
    fireEvent.keyDown(document, { key: 'Tab' }); button.focus();
    expect(scroll).not.toHaveBeenCalled();
  });

  it('leaves pointer focus in place even after earlier keyboard use', () => {
    const { button, scroll } = setup(880);
    fireEvent.keyDown(document, { key: 'Tab' }); fireEvent.pointerDown(button); button.focus();
    expect(scroll).not.toHaveBeenCalled();
  });

  it('does not act on controls outside the current Reports scope', () => {
    const { scroll } = setup(880);
    const outside = screen.getByRole('button', { name: 'Outside report' });
    outside.scrollIntoView = scroll;
    fireEvent.keyDown(document, { key: 'Tab' }); outside.focus();
    expect(scroll).not.toHaveBeenCalled();
  });
});
