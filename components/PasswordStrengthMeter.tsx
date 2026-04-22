'use client';

interface PasswordStrengthResult {
  level: 0 | 1 | 2 | 3;
  label: string;
  color: string;
  textColor: string;
}

function getStrength(password: string): PasswordStrengthResult {
  if (!password || password.length < 6) {
    return { level: 0, label: 'Too short', color: 'bg-rose-400', textColor: 'text-rose-500' };
  }
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const score = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;

  if (password.length >= 10 && score >= 3) {
    return { level: 3, label: 'Strong', color: 'bg-emerald-500', textColor: 'text-emerald-600' };
  }
  if (password.length >= 8 && score >= 2) {
    return { level: 2, label: 'Good', color: 'bg-amber-400', textColor: 'text-amber-600' };
  }
  return { level: 1, label: 'Weak', color: 'bg-rose-400', textColor: 'text-rose-500' };
}

export default function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const strength = getStrength(password);

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
              i <= strength.level ? strength.color : 'bg-black/10'
            }`}
          />
        ))}
      </div>
      <p className={`text-xs font-medium ${strength.textColor}`}>{strength.label}</p>
    </div>
  );
}
