'use client';
import { useEffect } from 'react';

export default function BusinessNameSaver({ name }: { name: string }) {
  useEffect(() => {
    if (name) {
      localStorage.setItem('tillflow:lastBusinessName', name);
    }
  }, [name]);

  return null;
}
