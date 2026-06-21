'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function SplashRemover() {
  const pathname = usePathname();

  useEffect(() => {
    const remove = () => {
      const el = document.getElementById('tillflow-initial-splash');
      if (el) el.remove();
    };

    const el = document.getElementById('tillflow-initial-splash');
    if (!el) return;

    const isPublicAuthRoute = pathname === '/login' || pathname === '/welcome' || pathname === '/register';
    let isLaunchHandoff = false;

    try {
      isLaunchHandoff =
        window.sessionStorage.getItem('tillflow:launching') === '1' &&
        window.sessionStorage.getItem('tillflow:launchSplashSeen') !== '1' &&
        !isPublicAuthRoute;
    } catch {
      isLaunchHandoff = false;
    }

    if (isLaunchHandoff) {
      const failsafe = setTimeout(remove, 8000);
      return () => {
        clearTimeout(failsafe);
      };
    }

    if (isPublicAuthRoute) {
      try {
        window.sessionStorage.removeItem('tillflow:launching');
        window.sessionStorage.setItem('tillflow:launchSplashSeen', '1');
      } catch {
        // Storage can be unavailable; proceed with visual cleanup.
      }
    }

    el.style.transition = 'opacity 0.25s ease';
    el.style.opacity = '0';
    const fadeTimer = setTimeout(remove, 280);
    const failsafe = setTimeout(remove, 8000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(failsafe);
    };
  }, [pathname]);

  return null;
}
