import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}));

vi.mock("@/lib/supabase/client", () => ({
  getBrowserSupabaseClient: () => ({ auth: { signOut: mocks.signOut } }),
}));

import { SignOutButton } from "./sign-out-button";

afterEach(cleanup);

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    mock.mockReset();
  }
  mocks.signOut.mockResolvedValue({ error: null });
});

describe("SignOutButton", () => {
  it("clears the local session and returns to sign-in", async () => {
    const user = userEvent.setup();
    render(<SignOutButton />);

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() =>
      expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" }),
    );
    expect(mocks.replace).toHaveBeenCalledWith("/sign-in");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("leaves the product even when the Auth call rejects", async () => {
    mocks.signOut.mockRejectedValue(new Error("auth unavailable"));

    const user = userEvent.setup();
    render(<SignOutButton />);

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/sign-in"));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
