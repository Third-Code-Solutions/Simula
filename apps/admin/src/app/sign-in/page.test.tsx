import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

const { mockedWorkspaceOrigin } = vi.hoisted(() => ({
  mockedWorkspaceOrigin: vi.fn(),
}));

vi.mock("@/lib/platform-api", () => ({
  workspaceOrigin: mockedWorkspaceOrigin,
}));

vi.mock("./sign-in-form", () => ({
  SignInForm: () => <form aria-label="Sign in form" />,
}));

import SignInPage from "./page";

beforeEach(() => {
  mockedWorkspaceOrigin.mockReset();
});

test("uses the validated workspace origin for the SIMULA link", () => {
  mockedWorkspaceOrigin.mockReturnValue("https://simula.example");

  render(<SignInPage />);

  expect(
    screen.getByRole("link", { name: "SIMULA main site" }),
  ).toHaveAttribute("href", "https://simula.example");
});

test("does not render a SIMULA navigation link without a workspace origin", () => {
  mockedWorkspaceOrigin.mockReturnValue(undefined);

  render(<SignInPage />);

  expect(
    screen.queryByRole("link", { name: "SIMULA main site" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("SIMULA")).toHaveClass("wordmark");
});
