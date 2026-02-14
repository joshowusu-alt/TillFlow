import { login } from '@/app/actions/auth';

export default function LoginPage({ searchParams }: { searchParams?: { error?: string } }) {
  const error = searchParams?.error;
  return (
    <div className="space-y-6">
      <div className="text-center">
        <img src="/icon.svg" alt="TillFlow" className="mx-auto h-16 w-16 rounded-2xl shadow-lg mb-4" />
        <h1 className="text-3xl font-bold font-display">
          <span className="text-emerald-600">Till</span>
          <span className="text-gray-800">Flow</span>
        </h1>
        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-black/40">Sales made simple</p>
        <p className="mt-4 text-sm text-black/60">Sign in to your account</p>
      </div>
      {error && (
        <div className="rounded-xl border border-rose/30 bg-rose/10 px-3 py-2 text-sm text-rose">
          Invalid credentials. Please try again.
        </div>
      )}
      <form action={login} className="space-y-4">
        <div>
          <label className="label">Email</label>
          <input name="email" type="email" className="input" placeholder="you@yourstore.com" required />
        </div>
        <div>
          <label className="label">Password</label>
          <input name="password" type="password" className="input" placeholder="••••••••" required />
        </div>
        <button className="btn-primary w-full" type="submit">Sign in</button>
      </form>
    </div>
  );
}

