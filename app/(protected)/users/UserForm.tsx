'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { createUserAction, updateUserAction } from '@/app/actions/users';
import { userFormErrorMessage } from './user-form-errors';

export default function UserForm({ editing, children }: { editing: boolean; children: ReactNode }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);

  async function create(formData: FormData) {
    setFeedback(null);
    const result = await createUserAction(formData);
    if (!result.success) {
      setFeedback({ success: false, message: userFormErrorMessage(result.error) });
      return;
    }
    setFeedback({ success: true, message: 'User created successfully.' });
    // Refresh the server-rendered list even on repeated creation at the same URL.
    router.refresh();
  }

  return (
    <form action={editing ? updateUserAction : create} className="grid gap-4 sm:grid-cols-2">
      {feedback && (
        <p role={feedback.success ? 'status' : 'alert'} className={`sm:col-span-2 rounded-lg border px-4 py-3 text-sm ${feedback.success ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {feedback.message}
        </p>
      )}
      {children}
    </form>
  );
}
