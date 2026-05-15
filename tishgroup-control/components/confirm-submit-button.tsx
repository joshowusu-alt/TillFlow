'use client';

import { ButtonHTMLAttributes } from 'react';
import { useFormStatus } from 'react-dom';

type ConfirmSubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  confirmMessage?: string;
  pendingLabel?: string;
};

export default function ConfirmSubmitButton({
  children,
  confirmMessage,
  pendingLabel = 'Saving...',
  onClick,
  disabled,
  ...props
}: ConfirmSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      {...props}
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
