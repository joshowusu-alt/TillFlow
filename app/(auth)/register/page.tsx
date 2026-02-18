import { register } from '@/app/actions/register';
import SubmitButton from '@/components/SubmitButton';
import Link from 'next/link';

export default async function RegisterPage({ searchParams }: { searchParams: { error?: string; mode?: string } }) {
  const error = searchParams?.error;
  const isDemo = searchParams?.mode === 'demo';

  const errorMessages: Record<string, string> = {
    missing: 'Please fill in all fields.',
    weak: 'Password must be at least 6 characters.',
    exists: 'An account with that email already exists. Please sign in instead.',
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <img src="/icon.svg" alt="TillFlow" className="mx-auto h-16 w-16 rounded-2xl shadow-lg mb-4" />
        <h1 className="text-3xl font-bold font-display">
          <span className="text-accent">Till</span>
          <span className="text-gray-800">Flow</span>
        </h1>
        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-black/40">Sales made simple</p>

        {isDemo ? (
          <div className="mt-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-accentSoft border border-accent/20 px-4 py-1.5 text-sm font-medium text-accent mb-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
              </span>
              Demo Mode
            </div>
            <p className="text-sm text-black/60">Create a demo store with sample products to explore TillFlow instantly.</p>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-black/60">Create your store from scratch - just your products, your way.</p>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {errorMessages[error] || 'Something went wrong. Please try again.'}
        </div>
      )}

      <form action={register} className="space-y-4">
        <input type="hidden" name="mode" value={isDemo ? 'demo' : 'fresh'} />

        <div>
          <label className="label">Business / Store Name</label>
          <input
            name="businessName"
            type="text"
            className="input"
            placeholder={isDemo ? 'e.g. Demo Supermarket' : 'e.g. El-Shaddai Supermarket'}
            required
          />
        </div>
        <div>
          <label className="label">Your Name</label>
          <input name="ownerName" type="text" className="input" placeholder="e.g. Kingsley Atakorah" required />
        </div>
        <div>
          <label className="label">Email</label>
          <input name="email" type="email" className="input" placeholder="you@yourstore.com" required />
        </div>
        <div>
          <label className="label">Password</label>
          <input name="password" type="password" className="input" placeholder="At least 6 characters" required minLength={6} />
        </div>
        <div>
          <label className="label">Currency</label>
          <select name="currency" className="input" defaultValue="GHS">
            <option value="GHS">GHS — Ghana Cedi</option>
            <option value="NGN">NGN — Nigerian Naira</option>
            <option value="KES">KES — Kenyan Shilling</option>
            <option value="UGX">UGX — Ugandan Shilling</option>
            <option value="TZS">TZS — Tanzanian Shilling</option>
            <option value="ZAR">ZAR — South African Rand</option>
            <option value="XOF">XOF — West African CFA</option>
            <option value="XAF">XAF — Central African CFA</option>
            <option value="GBP">GBP — British Pound</option>
            <option value="USD">USD — US Dollar</option>
            <option value="EUR">EUR — Euro</option>
          </select>
        </div>

        {isDemo && (
          <div className="rounded-xl bg-accentSoft border border-accent/10 px-4 py-3 text-sm text-accent">
            <span className="font-semibold">Demo includes:</span> 10 products, 7 categories, 3 customers, and 1 supplier loaded automatically.
          </div>
        )}

        {!isDemo && (
          <div className="rounded-xl bg-accentSoft border border-accent/10 px-4 py-3 text-sm text-accent">
            <span className="font-semibold">Clean start:</span> Your store will be created empty so you can add your own products from scratch.
          </div>
        )}

        <SubmitButton loadingText={isDemo ? 'Setting up demo...' : 'Creating your store...'}>
          {isDemo ? 'Create Demo Store' : 'Create My Business'}
        </SubmitButton>
      </form>

      <div className="text-center space-y-2">
        {isDemo ? (
          <p className="text-sm text-black/40">
            Want a clean start instead?{' '}
            <Link href="/register" className="font-medium text-accent hover:text-accent underline underline-offset-4">
              Create from scratch
            </Link>
          </p>
        ) : (
          <p className="text-sm text-black/40">
            Want to explore first?{' '}
            <Link href="/register?mode=demo" className="font-medium text-accent hover:text-accent underline underline-offset-4">
              Try the demo
            </Link>
          </p>
        )}
        <p className="text-sm text-black/50">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-accent hover:text-accent underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
