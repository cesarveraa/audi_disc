import { FormEvent, useState } from 'react';
import { LockKeyhole, Mail, ShieldCheck } from 'lucide-react';

import { useAuth } from '@app/providers/AuthProvider';
import { AppButton } from '@core/ui/AppButton';

export default function LoginScreen() {
  const { authEnabled, error, isLoading, login, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();
    await login(email, password);
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,rgba(228,0,43,0.20),transparent_30%),linear-gradient(135deg,#111827_0%,#151922_48%,#0b0f17_100%)] px-4 text-white">
      <section className="w-full max-w-md rounded-[28px] border border-white/10 bg-white/[0.08] p-6 shadow-luxury backdrop-blur-2xl">
        <div className="mb-8 flex items-center gap-3">
          <img src="/audidisc.jpg" alt="Audi Disc" className="h-14 w-14 rounded-2xl object-cover" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-audi-red">
              Audi Red Premium
            </p>
            <h1 className="mt-1 text-2xl font-semibold">Acceso seguro</h1>
          </div>
        </div>

        <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.07] p-4">
          <div className="flex items-center gap-3 text-sm font-semibold text-white">
            <ShieldCheck className="h-5 w-5 text-audi-red" />
            Firebase Auth + RBAC
          </div>
          <p className="mt-2 text-sm leading-6 text-white/62">
            Los roles y permisos se leen desde Firebase custom claims y el modulo de Usuarios.
          </p>
        </div>

        {!authEnabled && (
          <div className="mb-5 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-gray-950">
            Firebase Auth no esta configurado. Define las variables `VITE_FIREBASE_*` para acceder.
          </div>
        )}

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-2 text-sm font-semibold text-white/80">
            Correo
            <span className="flex h-12 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.08] px-4">
              <Mail className="h-4 w-4 text-white/50" />
              <input
                value={email}
                onChange={event => setEmail(event.target.value)}
                type="email"
                className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/35"
                placeholder="admin@audidisc.com"
                autoComplete="email"
              />
            </span>
          </label>

          <label className="grid gap-2 text-sm font-semibold text-white/80">
            Password
            <span className="flex h-12 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.08] px-4">
              <LockKeyhole className="h-4 w-4 text-white/50" />
              <input
                value={password}
                onChange={event => setPassword(event.target.value)}
                type="password"
                className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/35"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </span>
          </label>

          {error && (
            <div className="rounded-2xl bg-audi-red px-4 py-3 text-sm font-semibold text-white">
              {error}
            </div>
          )}

          <AppButton
            variant="primary"
            className="mt-2 h-14 justify-center"
            isLoading={isLoading}
            disabled={!authEnabled || !email || !password}
          >
            Entrar
          </AppButton>
        </form>
      </section>
    </main>
  );
}
