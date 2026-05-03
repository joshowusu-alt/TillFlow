'use client';

import { useKeyboardSafeViewport } from '@/hooks/useKeyboardSafeViewport';

export default function KeyboardViewportBridge() {
  useKeyboardSafeViewport();
  return null;
}
