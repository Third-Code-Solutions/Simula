import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resetPasswordForEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/client", () => ({
  getBrowserSupabaseClient: () => ({
    auth: { resetPasswordForEmail },
  }),
}));

import { ForgotPasswordForm } from "./forgot-password-form";

afterEach(cleanup);

beforeEach(() => {
  resetPasswordForEmail.mockReset();
  resetPasswordForEmail.mockResolvedValue({ error: null });
});

describe("ForgotPasswordForm", () => {
  it("sends a reset request to the current application origin", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);
    await user.type(
      screen.getByLabelText("Email address"),
      "owner@example.test",
    );
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => expect(resetPasswordForEmail).toHaveBeenCalledOnce());
    expect(resetPasswordForEmail).toHaveBeenCalledWith("owner@example.test", {
      redirectTo: "http://localhost:3000/reset-password",
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "If an account exists",
    );
  });
});
