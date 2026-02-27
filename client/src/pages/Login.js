import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import horseshoe from "./horseshoe_now.jpg";
import "./Auth.css"

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const navigate = useNavigate();
  const API_BASE = process.env.REACT_APP_API_BASE_URL || "http://localhost:4000";

  // avoid setState on unmounted component
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return; // prevent double sumbit

    setMsg("");
    setLoading(true);
    setSlow(false);

    // hide browser vaildation tooltip focus
    document.activeElement?.blur?.();

    // trim email (prevents invisible trailing spaces causing invailed email)
    const cleanEmail = email.trim().toLocaleLowerCase();
    const cleanPassword = password; // not triming the password

    if (!cleanEmail || !cleanPassword) {
      setMsg("Email and password are required.");
      setLoading(false);
      return;
    }

    // show "waking up server" message if request takes > 1.2s
    const slowTimer = setTimeout(() => {
      if (mountedRef.current) setSlow(true);
    }, 1200);

    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, password: cleanPassword }),
      });

      const data = await res.json().catch(() => ({}));

      if (!mountedRef.current) return;

      if (res.ok) {
        localStorage.setItem("token", data.token || "");
        navigate("/app/explore");
      } else {
        setMsg(data.message || "Invalid email or password");
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setMsg(
        "Network error. If this is the first request, the server may be waking up (Render free tier). Try again in a few seconds."
      );
    } finally {
      clearTimeout(slowTimer);
      if (mountedRef.current) {
        setLoading(false);
        setSlow(false); // hide slow message after completion
      }
    }
  }

  return (
    <div className="auth-page">
      <header className="auth-header">
        <h1 className="auth-header-title">
          LOG IN
        </h1>
      </header>

      <main className="auth-main">
        <div className="auth-image-wrap">
          <img className="auth-image" src={horseshoe} alt="USC Horseshoe" />
        </div>

        <div className="auth-card">
          <h2 className="auth-card-title">Login</h2>

          {/* noValidate prevents browser “Please enter an email address.” tooltips */}
          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <input
            className="auth-input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <div className="auth-row">
              <input
                className="auth-input auth-grow"
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
              className="auth-btn auth-btn--show"
                type="button"
                onClick={() => setShowPassword((s) => !s)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            <button
              className="auth-btn auth-btn--primary"
              type="submit"
              disabled={loading}
            >
              {loading ? "Logging in..." : "Log In"}
            </button>

            {slow && !msg && (
              <div className="auth-msg">
                Waking up server… (Render free tier can take ~10–20s on the first
                request)
              </div>
            )}

            {msg && <div className="auth-error">{msg}</div>}

            {/* Back / Sign up row */}
 
            {msg && <div className="auth-error">{msg}</div>}

            <div className="auth-msg" style={{ marginTop: 6 }}>
              Don&apos;t have an account? Sign up here:
              <button
                className="auth-btn auth-btn--link"
                type="button"
                onClick={() => navigate("/")}
              >
                Sign Up
              </button>
            </div>
          </form>
        </div>
      </main>

      <footer className="auth-footer">Cola Trails</footer>
    </div>
  );
}