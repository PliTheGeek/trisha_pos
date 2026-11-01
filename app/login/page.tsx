'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { signIn } from '@/app/actions/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError('');
    const result = await signIn({ email, password });
    if (result.error) setError(result.error);
    else router.push('/');
    setLoading(false);
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
    <form onSubmit={submit} className="w-full max-w-sm border border-slate-200 bg-white p-6 shadow-lg">
      <div className="mb-6 border-b border-slate-200 pb-4">
        <Image
          src="/logo/logo.png"
          alt="Trisha Cafe logo"
          width={72}
          height={72}
          priority
          quality={90}
          className="mb-4 h-16 w-16 object-contain"
        />
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Trisha POS</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-800">Cashier Login</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to continue to the point of sale.</p>
      </div>
      {error && <p role="alert" className="mb-4 border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-slate-700">Email</label>
          <input id="email" className="w-full border border-slate-300 bg-white px-3 py-2.5 text-slate-800 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100" type="email" required autoComplete="email" placeholder="cashier@example.com" value={email} onChange={event => setEmail(event.target.value)} />
        </div>
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-slate-700">Password</label>
          <input id="password" className="w-full border border-slate-300 bg-white px-3 py-2.5 text-slate-800 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100" type="password" required autoComplete="current-password" placeholder="Enter your password" value={password} onChange={event => setPassword(event.target.value)} />
        </div>
      </div>
      <button disabled={loading} className="mt-6 w-full border border-blue-600 bg-blue-600 p-3 font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{loading ? 'Signing in...' : 'Sign in'}</button>
    </form>
  </main>;
}
