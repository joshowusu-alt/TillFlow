'use client';

import { Component, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  fallback: ReactNode;
  /** Optional label for diagnostics — never shown to owners. */
  section?: string;
};

type State = { hasError: boolean };

/**
 * Isolates a deferred Owner Home section so a loader failure cannot blank the page.
 * Does not render technical exception messages.
 */
export default class HomeSectionErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    // No owner-facing detail is rendered — log server/browser-side so failures are diagnosable.
    console.error(`[home.section-error-boundary] section="${this.props.section ?? 'unknown'}" render failed`, error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
