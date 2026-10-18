import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router";
import { appName, homePath } from "@cws/shared";
import { useSession } from "./session";

export function LoginPage() {
  const { user, loading, login } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return <p className="pending">Loading…</p>;
  }
  if (user) {
    return <Navigate to={homePath(user.role)} replace />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const message = await login(email, password);
      if (message) {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login">
      <div className="login-wrap">
        <form className="login-card" onSubmit={onSubmit}>
          <p className="eyebrow">{appName}</p>
          <h1>Sign in</h1>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="primary" type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="login-home">
          <Link to="/">Back to the homepage</Link>
        </p>
      </div>
    </main>
  );
}
