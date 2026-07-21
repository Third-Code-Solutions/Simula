import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ContextGraph } from "./context-graph";

describe("ContextGraph", () => {
  it("provides a text-equivalent trace for the visual graph", () => {
    render(<ContextGraph />);

    const graph = screen.getByRole("figure", {
      name: /every output remains attached/i,
    });

    expect(within(graph).getAllByRole("listitem")).toHaveLength(6);
    expect(within(graph).getByText("Non-representative")).toBeInTheDocument();
    expect(
      within(graph).getByText(/stimulus version 3.*provenance receipt/i),
    ).toBeInTheDocument();
  });
});
