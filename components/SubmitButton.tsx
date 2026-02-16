'use client';

import { useFormStatus } from 'react-dom';

/**
 * A submit button that shows a loading spinner + custom loading text
 * when the parent <form> is submitting via a server action.
 */
export default function SubmitButton({
  children,
  loadingText = 'Please wait…',
  className = 'btn-primary w-full',
}: {
  children: React.ReactNode;
  loadingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {loadingText}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
