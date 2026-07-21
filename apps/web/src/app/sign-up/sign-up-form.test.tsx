import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  getBrowserSupabaseClient: () => ({
    auth: {
      signOut: mocks.signOut,
      signUp: mocks.signUp,
    },
  }),
}));

import { SignUpForm } from "./sign-up-form";

afterEach(cleanup);

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    mock.mockReset();
  }
  mocks.signUp.mockResolvedValue({
    data: { session: null },
    error: null,
  });
  mocks.signOut.mockResolvedValue({ error: null });
});

async function submitAccount() {
  const user = userEvent.setup();
  render(<SignUpForm />);
  await user.type(screen.getByLabelText("Email address"), "new@example.test");
  await user.type(screen.getByLabelText("Password"), "secure-password");
  await user.type(screen.getByLabelText("Confirm password"), "secure-password");
  await user.click(screen.getByRole("button", { name: "Create account" }));
}

describe("SignUpForm", () => {
  it("creates an account and explains email confirmation", async () => {
    await submitAccount();

    await waitFor(() => expect(mocks.signUp).toHaveBeenCalledOnce());
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: "new@example.test",
      password: "secure-password",
      options: { emailRedirectTo: "http://localhost:3000/sign-in" },
    });
    expect(
      await screen.findByRole("status", {
        name: "",
      }),
    ).toHaveTextContent("Account created. Check your email");
  });

  it("rejects mismatched passwords before contacting Auth", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);
    await user.type(screen.getByLabelText("Email address"), "new@example.test");
    await user.type(screen.getByLabelText("Password"), "secure-password");
    await user.type(
      screen.getByLabelText("Confirm password"),
      "different-password",
    );
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Passwords do not match.",
    );
    expect(mocks.signUp).not.toHaveBeenCalled();
  });
});
