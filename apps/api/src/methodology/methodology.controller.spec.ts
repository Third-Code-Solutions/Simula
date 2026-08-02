import { uuid5Url } from "./methodology.controller";

describe("methodology preview identity", () => {
  it("byte-matches Python uuid5(NAMESPACE_URL)", () => {
    expect(
      uuid5Url(
        "simula:018f274b-3c77-7b22-b749-c9274230ef9a:" +
          "018f274b-3c77-7b22-b749-c9274230ef9c:" +
          "018f274b-3c77-7b22-b749-c9274230ef9d:" +
          "018f274b-3c77-7b22-b749-c9274230ef9e:" +
          "methodology-preview-0001",
      ),
    ).toBe("420bfc6c-3ddd-558e-8f70-f5e78926eb28");
  });
});
