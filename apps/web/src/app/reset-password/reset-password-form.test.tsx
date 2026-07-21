import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("@/lib/supabase/client", () => ({
  getBrowserSupabaseClient: () => ({
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      signOut: mocks.signOut,
      updateUser: mocks.updateUser,
    },
  }),
}));

import { ResetPasswordForm } from "./reset-password-form";

afterEach(cleanup);

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    mock.mockReset();
  }
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "user-1" } } },
    error: null,
  });
  mocks.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
});

describe("ResetPasswordForm", () => {
  it("updates the password and clears the recovery session", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm />);
    await waitFor(() => expect(mocks.getSession).toHaveBeenCalledOnce());
    await user.type(screen.getByLabelText("New password"), "new-password");
    await user.type(
      screen.getByLabelText("Confirm new password"),
      "new-password",
    );
    await user.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => expect(mocks.updateUser).toHaveBeenCalledOnce());
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "new-password" });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Password updated.",
    );
  });
});
