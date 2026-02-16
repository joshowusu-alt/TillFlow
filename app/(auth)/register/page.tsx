import { register } from '@/app/actions/register';
import Link from 'next/link';

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

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
          <span className="text-emerald-600">Till</span>
          <span className="text-gray-800">Flow</span>
        </h1>
        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-black/40">Sales made simple</p>
        <p className="mt-4 text-sm text-black/60">Create your store account</p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose/30 bg-rose/10 px-3 py-2 text-sm text-rose">
          {errorMessages[error] || 'Something went wrong. Please try again.'}
        </div>
      )}

      <form action={register} className="space-y-4">
        <div>
          <label className="label">Business / Store Name</label>
          <input name="businessName" type="text" className="input" placeholder="e.g. El-Shaddai Supermarket" required />
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
        <button className="btn-primary w-full" type="submit">Create Account</button>
      </form>

      <div className="text-center text-sm text-black/50">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-emerald-600 hover:text-emerald-700 underline underline-offset-4">
          Sign in
        </Link>
      </div>
    </div>
  );
}
