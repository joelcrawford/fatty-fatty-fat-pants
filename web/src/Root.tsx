import { useCallback, useEffect, useState } from "react";
import type { Profile } from "@nutrition/shared";
import App from "./App";
import { AuthScreens, ResetPasswordScreen, Shell } from "./AuthScreens";
import { Onboarding } from "./Onboarding";
import { client } from "./api";
import { session, User } from "./session";

const resetTokenFromUrl = () =>
  window.location.pathname.replace(/\/$/, "") === "/reset-password" ? new URLSearchParams(window.location.search).get("token") : null;

/** Decides what the visitor sees: the reset page, the login screens, or the app. */
export default function Root() {
  const [user, setUser] = useState<User | null>(session.user);
  const [restoring, setRestoring] = useState(true);
  const [resetToken, setResetToken] = useState(resetTokenFromUrl);

  // undefined = not looked up yet, null = looked up and they have not onboarded.
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = session.subscribe((u) => {
      setUser(u);
      setProfile(undefined); // a different user has a different profile
    });
    session.restore().finally(() => setRestoring(false));
    return unsubscribe;
  }, []);

  // Their profile decides whether they see onboarding or the app.
  useEffect(() => {
    if (!user || profile !== undefined) return;
    let cancelled = false;
    client.profile.get()
      .then((r) => { if (!cancelled) setProfile(r.profile); })
      .catch(() => { if (!cancelled) setProfile(null); });
    return () => { cancelled = true; };
  }, [user, profile]);

  const reloadProfile = useCallback(() => setProfile(undefined), []);

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
  if (profile === undefined) return <Shell title="Nutrition Tracker" subtitle="Loading…">{null}</Shell>;
  if (profile === null) return <Onboarding key={user.id} name={user.name} onDone={setProfile} />;

  // key: a different user must never see the previous user's state.
  return <App key={user.id} user={user} profile={profile} onProfileChanged={reloadProfile} />;
}
