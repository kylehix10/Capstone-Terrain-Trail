import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import horseshoe from "./horseshoe_now.jpg";
import "./Auth.css";

export default function SignUp() {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const navigate = useNavigate();
  const API_BASE = process.env.REACT_APP_API_BASE_URL || "http://localhost:4000";


  const passwordsMatch = password.length > 0 && password === confirm;

  async function handleSubmit(e) {
  e.preventDefault();
  setMsg("");

  if (!passwordsMatch) {
    setMsg("Passwords do not match");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, username, email, password }),
    });

    // Safely parse JSON (prevents crashes if server returns empty/non-JSON)
    let data = null;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) data = await res.json();
    else data = await res.text();

    if (res.ok) {
      navigate("/login");
      return;
    }

    // If not ok, show whatever message we can
    if (data && typeof data === "object" && data.message) setMsg(data.message);
    else if (typeof data === "string" && data.length) setMsg(data);
    else setMsg("Signup failed");
  } catch (err) {
    console.error("SIGNUP ERROR:", err);
    setMsg("Could not reach server. Is the backend running?");
  }
}

  return (
    <div className="auth-page">
      <header className="auth-header">
        <h1 className="auth-header-title">SIGN UP</h1>
      </header>

      <main className="auth-main">
        {/* Hidden on small screens by CSS */}
        <div className="auth-image-wrap">
          <img className="auth-image" src={horseshoe} alt="USC Horseshoe" />
        </div>

        <div className="auth-card" >
          <h2 className="auth-card-title">Sign Up</h2>

          <form className="auth-form" onSubmit={handleSubmit}>
            <input
              className="auth-input"
              type="text"
              placeholder="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <input
              className="auth-input"
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />

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

            <div className="auth-row">
              <input
                className="auth-input auth-grow"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Retype Password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                aria-invalid={confirm.length > 0 && !passwordsMatch}
                style={{
                  border:
                    confirm.length > 0 && !passwordsMatch
                      ? "1px solid #c62828"
                      : undefined,
                }}
              />
              <button
                className="auth-btn auth-btn--show"
                type="button"
                onClick={() => setShowConfirmPassword((s) => !s)}
              >
                {showConfirmPassword ? "Hide" : "Show"}
              </button>
            </div>

            {!passwordsMatch && confirm.length > 0 && (
              <div className="auth-error">Passwords do not match</div>
            )}

            <div className="auth-row" style={{ gap: 12, marginTop: 6 }}>
              <button
                className="auth-btn auth-btn--primary auth-grow"
                type="submit"
                disabled={!passwordsMatch}
              >
                Sign Up
              </button>

              <button
                className="auth-btn auth-btn--secondary auth-grow"
                type="button"
                onClick={() => navigate("/login")}
              >
                Log In
              </button>
            </div>

            {msg && <div className="auth-error">{msg}</div>}
          </form>
        </div>
      </main>

      <footer className="auth-footer">Cola Trails</footer>
    </div>
  );
}