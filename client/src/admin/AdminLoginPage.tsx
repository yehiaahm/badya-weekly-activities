import { CircleAlert, LogIn } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import logoUrl from '../assets/sac-logo.png';
import { LoadingState, TextField } from '../components/ui.tsx';
import { errorMessage } from '../lib/api.ts';
import { useSession } from '../lib/queries.ts';
import { useAdminLogin } from './queries.ts';

function safeNext(value: string | null): string {
  // Only allow in-app admin paths, never an external URL.
  return value && value.startsWith('/admin') && !value.startsWith('//') ? value : '/admin';
}

export function AdminLoginPage() {
  const session = useSession();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const login = useAdminLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const next = safeNext(params.get('next'));

  if (session.isPending) return <LoadingState />;
  if (session.data?.admin) return <Navigate to={next} replace />;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate({ email: email.trim(), password }, { onSuccess: () => navigate(next, { replace: true }) });
  };

  return (
    <div className="login-shell">
      <div className="login-intro">
        <span className="hero-eyebrow">Play · Unite · Inspire</span>
        <p className="display">SAC Sports Hub</p>
        <span>Sports Office · Badya University</span>
      </div>
      <form className="card login-card stack" onSubmit={submit}>
        <img src={logoUrl} alt="Student Athlete Committee" className="login-logo" width={224} height={126} />
        <div className="login-heading">
          <h1>Staff sign in</h1>
          <p className="muted">Manage the monthly calendar, reservations and attendance.</p>
        </div>
        {login.error && (
          <div className="alert alert-danger" role="alert">
            <CircleAlert size={18} />
            <span>{errorMessage(login.error)}</span>
          </div>
        )}
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={login.isPending || !email || !password}>
          {login.isPending ? <span className="spinner" aria-hidden /> : <LogIn size={18} />} Sign in
        </button>
        <Link to="/" className="muted" style={{ textAlign: 'center', fontSize: '0.88rem' }}>
          ← Back to Weekly Activities
        </Link>
      </form>
    </div>
  );
}
