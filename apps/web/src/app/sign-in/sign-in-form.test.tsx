import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordSignIn: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}));

vi.mock("@/lib/api", () => ({ recordSignIn: mocks.recordSignIn }));

vi.mock("@/lib/supabase/client", () => ({
  getBrowserSupabaseClient: () => ({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
    },
  }),
}));

import { SignInForm } from "./sign-in-form";

afterEach(cleanup);

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    mock.mockReset();
  }
  mocks.signInWithPassword.mockResolvedValue({ error: null });
  mocks.recordSignIn.mockResolvedValue({ kind: "sign_in", recorded: true });
  mocks.signOut.mockResolvedValue({ error: null });
});

async function submitCredentials() {
  const user = userEvent.setup();
  render(<SignInForm nextPath="/organizations" />);
  await user.type(screen.getByLabelText("Email address"), "owner@example.test");
  await user.type(screen.getByLabelText("Password"), "synthetic-password");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("SignInForm", () => {
  it("records the verified session before entering the product", async () => {
    await submitCredentials();

    await waitFor(() => expect(mocks.recordSignIn).toHaveBeenCalledOnce());
    expect(mocks.replace).toHaveBeenCalledWith("/organizations");
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("fails closed and clears the local session when audit persistence fails", async () => {
    mocks.recordSignIn.mockRejectedValue(new Error("audit unavailable"));

    await submitCredentials();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sign-in could not be audited safely. Retry shortly.",
    );
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
