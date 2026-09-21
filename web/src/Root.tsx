import { useEffect, useState } from "react";
import App from "./App";
import { AuthScreens, ResetPasswordScreen, Shell } from "./AuthScreens";
import { session, User } from "./session";

const resetTokenFromUrl = () =>
  window.location.pathname.replace(/\/$/, "") === "/reset-password" ? new URLSearchParams(window.location.search).get("token") : null;

/** Decides what the visitor sees: the reset page, the login screens, or the app. */
export default function Root() {
  const [user, setUser] = useState<User | null>(session.user);
  const [restoring, setRestoring] = useState(true);
  const [resetToken, setResetToken] = useState(resetTokenFromUrl);

  useEffect(() => {
    const unsubscribe = session.subscribe(setUser);
    session.restore().finally(() => setRestoring(false));
    return unsubscribe;
  }, []);

  if (resetToken) {
    return (
      <ResetPasswordScreen
        token={resetToken}
        onDone={() => {
          window.history.replaceState(null, "", "/"); // drop the token from the address bar and history
          setResetToken(null);
        }}
      />
    );
  }

  if (restoring) return <Shell title="Nutrition Tracker" subtitle="Loading…">{null}</Shell>;
  if (!user) return <AuthScreens />;

  // key: a different user must never see the previous user's state.
  return <App key={user.id} user={user} />;
}
