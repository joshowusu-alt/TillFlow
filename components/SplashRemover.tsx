'use client';
import { useEffect } from 'react';

export default function SplashRemover() {
  useEffect(() => {
    const remove = () => {
      const el = document.getElementById('tillflow-initial-splash');
      if (el) el.remove();
    };

    const el = document.getElementById('tillflow-initial-splash');
    if (!el) return;

    el.style.transition = 'opacity 0.25s ease';
    el.style.opacity = '0';
    const fadeTimer = setTimeout(remove, 280);
    const failsafe = setTimeout(remove, 8000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(failsafe);
    };
  }, []);

  return null;
}
