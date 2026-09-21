// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import Root from "./Root";
import { AccountPanel } from "./AuthScreens";
import { session, ApiError, User } from "./session";

// The real App talks to the API on mount; these tests are about the gate in front of it.
vi.mock("./App", () => ({ default: ({ user }: { user: User }) => <div>APP for {user.email}</div> }));
vi.mock("./Onboarding", () => ({ Onboarding: ({ name }: { name: string }) => <div>ONBOARDING for {name}</div> }));

const SAM: User = { id: 7, email: "sam@example.com", name: "Sam", created_at: "" };
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

/** Make the singleton session behave as if `user` had just logged in (or out). */
const become = (user: User | null) => act(() => {
  vi.spyOn(session, "user", "get").mockReturnValue(user);
  (session as any).listeners.forEach((l: (u: User | null) => void) => l(user));
});

/** By default the signed-in user has already onboarded. */
const withProfile = (profile: unknown = { units: "imperial" }) =>
  vi.spyOn(session, "request").mockImplementation(async (path: string) =>
    (path === "/api/profile" ? { profile } : {}) as never
  );

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  vi.spyOn(session, "restore").mockResolvedValue(null);
  withProfile();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("the gate", () => {
  it("shows the login screen when nobody is logged in, never the app", async () => {
    render(<Root />);
    expect(await screen.findByRole("button", { name: "Log in" })).toBeTruthy();
    expect(screen.queryByText(/APP for/)).toBeNull();
  });

  it("goes straight to the app when a stored session is restored", async () => {
    vi.spyOn(session, "restore").mockImplementation(async () => { await become(SAM); return SAM; });
    render(<Root />);
    expect(await screen.findByText("APP for sam@example.com")).toBeTruthy();
  });

  it("drops back to the login screen the moment the session ends", async () => {
    vi.spyOn(session, "restore").mockImplementation(async () => { await become(SAM); return SAM; });
    render(<Root />);
    await screen.findByText("APP for sam@example.com");

    await become(null); // e.g. a refresh was refused mid-use

    expect(await screen.findByRole("button", { name: "Log in" })).toBeTruthy();
    expect(screen.queryByText(/APP for/)).toBeNull();
  });
});

describe("onboarding", () => {
  it("a user with no profile is sent to onboarding, never into the app", async () => {
    withProfile(null);
    vi.spyOn(session, "restore").mockImplementation(async () => { await become(SAM); return SAM; });
    render(<Root />);

    expect(await screen.findByText("ONBOARDING for Sam")).toBeTruthy();
    expect(screen.queryByText(/APP for/)).toBeNull();
  });

  it("if the profile cannot be fetched we show onboarding rather than an app with no targets", async () => {
    vi.spyOn(session, "request").mockRejectedValue(new Error("offline"));
    vi.spyOn(session, "restore").mockImplementation(async () => { await become(SAM); return SAM; });
    render(<Root />);
    expect(await screen.findByText("ONBOARDING for Sam")).toBeTruthy();
  });

  it("the profile is looked up again for a different user, never reused", async () => {
    vi.spyOn(session, "restore").mockImplementation(async () => { await become(SAM); return SAM; });
    render(<Root />);
    await screen.findByText("APP for sam@example.com");

    withProfile(null);
    await become({ ...SAM, id: 99, email: "other@example.com", name: "Other" });

    expect(await screen.findByText("ONBOARDING for Other")).toBeTruthy();
  });
});

describe("logging in", () => {
  it("submits the credentials and shows the app", async () => {
    const login = vi.spyOn(session, "login").mockImplementation(async () => { await become(SAM); return SAM; });
    render(<Root />);
    await screen.findByRole("button", { name: "Log in" });

    type("Email", "sam@example.com");
    type("Password", "correct horse battery");
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText("APP for sam@example.com")).toBeTruthy();
    expect(login).toHaveBeenCalledWith("sam@example.com", "correct horse battery");
  });

  it("shows the API's own message when the password is wrong", async () => {
    vi.spyOn(session, "login").mockRejectedValue(new ApiError("Email or password is incorrect", 401));
    render(<Root />);
    await screen.findByRole("button", { name: "Log in" });
    type("Email", "sam@example.com");
    type("Password", "nope");
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Email or password is incorrect");
  });

  it("says something useful when the server cannot be reached", async () => {
    vi.spyOn(session, "login").mockRejectedValue(new TypeError("Failed to fetch"));
    render(<Root />);
    await screen.findByRole("button", { name: "Log in" });
    type("Email", "sam@example.com");
    type("Password", "whatever");
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/Could not reach the server/);
  });
});

describe("registering", () => {
  it("tidies the invite code (people type them in lower case with spaces) and keeps the email typed on the login screen", async () => {
    const register = vi.spyOn(session, "register").mockResolvedValue(SAM);
    render(<Root />);
    await screen.findByRole("button", { name: "Log in" });
    type("Email", "sam@example.com");
    fireEvent.click(screen.getByRole("button", { name: "I have an invite code" }));

    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("sam@example.com");
    type("Invite code", "  k7qm-2xrd-9htw ");
    type("Your name", "Sam");
    type("Password", "a long enough password");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(register).toHaveBeenCalledWith({
      email: "sam@example.com", password: "a long enough password", name: "Sam", invite_code: "K7QM-2XRD-9HTW",
    }));
  });
});

describe("forgotten password", () => {
  it("shows the server's deliberately vague confirmation", async () => {
    vi.spyOn(session, "forgotPassword").mockResolvedValue("If that email has an account, a reset link is on its way.");
    render(<Root />);
    await screen.findByRole("button", { name: "Log in" });
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    type("Email", "sam@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect((await screen.findByRole("status")).textContent).toBe("If that email has an account, a reset link is on its way.");
  });

  it("the link in the email opens the new-password page, uses the token, then scrubs it from the address bar", async () => {
    window.history.replaceState(null, "", "/reset-password?token=abc%2B123");
    const reset = vi.spyOn(session, "resetPassword").mockResolvedValue("Password updated. Please log in with your new password.");
    render(<Root />);

    type("New password", "my brand new password");
    fireEvent.click(screen.getByRole("button", { name: "Save new password" }));
    expect((await screen.findByRole("status")).textContent).toMatch(/Password updated/);
    expect(reset).toHaveBeenCalledWith("abc+123", "my brand new password");

    fireEvent.click(screen.getByRole("button", { name: "Go to log in" }));
    expect(window.location.pathname + window.location.search).toBe("/");
    expect(await screen.findByRole("button", { name: "Log in" })).toBeTruthy();
  });

  it("the reset page is shown even to someone already logged in", async () => {
    window.history.replaceState(null, "", "/reset-password?token=abc");
    vi.spyOn(session, "restore").mockImplementation(async () => { await become(SAM); return SAM; });
    render(<Root />);
    expect(await screen.findByRole("button", { name: "Save new password" })).toBeTruthy();
  });
});

describe("account panel", () => {
  beforeEach(() => { vi.spyOn(session, "user", "get").mockReturnValue(SAM); });

  it("logs out", () => {
    const logout = vi.spyOn(session, "logout").mockResolvedValue();
    render(<AccountPanel onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(logout).toHaveBeenCalled();
  });

  it("deleting the account is two deliberate steps and needs the password", async () => {
    const del = vi.spyOn(session, "deleteAccount").mockResolvedValue();
    render(<AccountPanel onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete my account…" }));
    expect(del).not.toHaveBeenCalled();
    expect(screen.getByText(/cannot be undone/)).toBeTruthy();

    type("Password", "correct horse battery");
    fireEvent.click(screen.getByRole("button", { name: "Delete my account forever" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith("correct horse battery"));
  });

  it("a wrong password shows the API's message and deletes nothing", async () => {
    vi.spyOn(session, "deleteAccount").mockRejectedValue(new ApiError("Password is incorrect", 403));
    render(<AccountPanel onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete my account…" }));
    type("Password", "wrong");
    fireEvent.click(screen.getByRole("button", { name: "Delete my account forever" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Password is incorrect");
  });
});
