import { FormEvent, ReactNode, useState } from "react";
import { session, ApiError } from "./session";

// Same palette as App.tsx. Kept local so this file stands alone.
const C = { bg: "#F8F5F0", primary: "#3D5A4C", accent: "#C4714A", text: "#2C2C2C", muted: "#8A8A8A", border: "#E8E4DC", danger: "#D64545" };

type Screen = "login" | "register" | "forgot";

const input: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`,
  fontSize: 15, background: C.bg, marginBottom: 12, fontFamily: "inherit",
};
const primaryButton: React.CSSProperties = {
  width: "100%", padding: 14, borderRadius: 12, border: "none", background: C.primary, color: "white",
  fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
};
const linkButton: React.CSSProperties = {
  background: "none", border: "none", color: C.primary, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 6, fontFamily: "inherit",
};

export function Shell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'DM Sans', sans-serif", color: C.text, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap'); * { box-sizing: border-box; }`}</style>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 6 }}>🥗</div>
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: C.primary, margin: 0, fontWeight: 400 }}>{title}</h1>
          {subtitle && <p style={{ fontSize: 13.5, color: C.muted, margin: "6px 0 0" }}>{subtitle}</p>}
        </div>
        <div style={{ background: "white", borderRadius: 18, padding: 22, boxShadow: "0 1px 10px rgba(0,0,0,0.06)" }}>{children}</div>
      </div>
    </div>
  );
}

/** Runs an async action with busy and error state. The error text comes straight from the API. */
function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = (action: () => Promise<unknown>) => async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

const ErrorNote = ({ children }: { children: string }) =>
  children ? <div role="alert" style={{ background: "#FCEBEB", color: C.danger, padding: "10px 12px", borderRadius: 10, fontSize: 13, marginBottom: 12 }}>{children}</div> : null;

export function AuthScreens() {
  const [screen, setScreen] = useState<Screen>("login");
  const [email, setEmail] = useState(""); // kept across screens so nobody retypes it
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [sentMessage, setSentMessage] = useState("");
  const { busy, error, run } = useSubmit();

  if (screen === "forgot") {
    return (
      <Shell title="Reset your password" subtitle="We'll email you a link to choose a new one.">
        {sentMessage ? (
          <>
            <p role="status" style={{ fontSize: 14, lineHeight: 1.5, margin: "0 0 16px" }}>{sentMessage}</p>
            <button style={primaryButton} onClick={() => { setSentMessage(""); setScreen("login"); }}>Back to log in</button>
          </>
        ) : (
          <form onSubmit={run(async () => setSentMessage(await session.forgotPassword(email)))}>
            <ErrorNote>{error}</ErrorNote>
            <input style={input} type="email" placeholder="Email" aria-label="Email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <button style={primaryButton} disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
            <div style={{ textAlign: "center", marginTop: 10 }}><button type="button" style={linkButton} onClick={() => setScreen("login")}>Back to log in</button></div>
          </form>
        )}
      </Shell>
    );
  }

  if (screen === "register") {
    return (
      <Shell title="Create your account" subtitle="You'll need an invite code to join.">
        <form onSubmit={run(() => session.register({ email, password, name, invite_code: inviteCode.trim().toUpperCase() }))}>
          <ErrorNote>{error}</ErrorNote>
          <input style={input} placeholder="Invite code" aria-label="Invite code" autoCapitalize="characters" required value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
          <input style={input} placeholder="Your name" aria-label="Your name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          <input style={input} type="email" placeholder="Email" aria-label="Email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <input style={input} type="password" placeholder="Password (at least 10 characters)" aria-label="Password" autoComplete="new-password" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} />
          <button style={primaryButton} disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
          <div style={{ textAlign: "center", marginTop: 10 }}><button type="button" style={linkButton} onClick={() => setScreen("login")}>I already have an account</button></div>
        </form>
      </Shell>
    );
  }

  return (
    <Shell title="Nutrition Tracker" subtitle="Log in to continue.">
      <form onSubmit={run(() => session.login(email, password))}>
        <ErrorNote>{error}</ErrorNote>
        <input style={input} type="email" placeholder="Email" aria-label="Email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input style={input} type="password" placeholder="Password" aria-label="Password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <button style={primaryButton} disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
          <button type="button" style={linkButton} onClick={() => setScreen("forgot")}>Forgot password?</button>
          <button type="button" style={linkButton} onClick={() => setScreen("register")}>I have an invite code</button>
        </div>
      </form>
    </Shell>
  );
}

/** Where reset emails point: /reset-password?token=… */
export function ResetPasswordScreen({ token, onDone }: { token: string; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [doneMessage, setDoneMessage] = useState("");
  const { busy, error, run } = useSubmit();

  return (
    <Shell title="Choose a new password">
      {doneMessage ? (
        <>
          <p role="status" style={{ fontSize: 14, lineHeight: 1.5, margin: "0 0 16px" }}>{doneMessage}</p>
          <button style={primaryButton} onClick={onDone}>Go to log in</button>
        </>
      ) : (
        <form onSubmit={run(async () => setDoneMessage(await session.resetPassword(token, password)))}>
          <ErrorNote>{error}</ErrorNote>
          <input style={input} type="password" placeholder="New password (at least 10 characters)" aria-label="New password" autoComplete="new-password" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} />
          <button style={primaryButton} disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
          <div style={{ textAlign: "center", marginTop: 10 }}><button type="button" style={linkButton} onClick={onDone}>Cancel</button></div>
        </form>
      )}
    </Shell>
  );
}

/** Log out, log out everywhere, delete account. Opened from the app header. */
export function AccountPanel({ onClose }: { onClose: () => void }) {
  const user = session.user;
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const { busy, error, run } = useSubmit();

  const secondary: React.CSSProperties = { ...primaryButton, background: "white", color: C.primary, border: `1.5px solid ${C.border}`, marginBottom: 10 };

  return (
    <div role="dialog" aria-label="Account" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", width: "100%", maxWidth: 480, borderRadius: "18px 18px 0 0", padding: 22, fontFamily: "'DM Sans', sans-serif", color: C.text }}>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 19, color: C.primary }}>{user?.name || "Your account"}</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 18 }}>{user?.email}</div>

        {!confirming ? (
          <>
            <button style={secondary} onClick={() => session.logout()}>Log out</button>
            <button style={secondary} onClick={() => session.logoutEverywhere()}>Log out of all devices</button>
            <button style={{ ...secondary, color: C.danger }} onClick={() => setConfirming(true)}>Delete my account…</button>
            <button style={{ ...linkButton, width: "100%" }} onClick={onClose}>Close</button>
          </>
        ) : (
          <form onSubmit={run(() => session.deleteAccount(password))}>
            <p style={{ fontSize: 13.5, lineHeight: 1.5, margin: "0 0 12px" }}>
              This permanently deletes your account and everything you have logged. It cannot be undone. Enter your password to confirm.
            </p>
            <ErrorNote>{error}</ErrorNote>
            <input style={input} type="password" placeholder="Password" aria-label="Password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <button style={{ ...primaryButton, background: C.danger }} disabled={busy}>{busy ? "Deleting…" : "Delete my account forever"}</button>
            <button type="button" style={{ ...linkButton, width: "100%", marginTop: 6 }} onClick={() => { setConfirming(false); setPassword(""); }}>Keep my account</button>
          </form>
        )}
      </div>
    </div>
  );
}
