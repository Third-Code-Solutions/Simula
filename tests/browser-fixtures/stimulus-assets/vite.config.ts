import path from "node:path";
import { fileURLToPath } from "node:url";

const fixtureRoot = fileURLToPath(new URL(".", import.meta.url));
const webRoot = path.resolve(fixtureRoot, "../../../apps/web");

export default {
  resolve: {
    alias: [
      {
        find: "@/lib/api",
        replacement: path.resolve(fixtureRoot, "src/api-fixture.ts"),
      },
      {
        find: "@",
        replacement: path.resolve(webRoot, "src"),
      },
      {
        find: "react-dom/client",
        replacement: path.resolve(webRoot, "node_modules/react-dom/client.js"),
      },
      {
        find: "react/jsx-dev-runtime",
        replacement: path.resolve(
          webRoot,
          "node_modules/react/jsx-dev-runtime.js",
        ),
      },
      {
        find: "react/jsx-runtime",
        replacement: path.resolve(webRoot, "node_modules/react/jsx-runtime.js"),
      },
      {
        find: "react",
        replacement: path.resolve(webRoot, "node_modules/react/index.js"),
      },
      {
        find: "tailwindcss",
        replacement: path.resolve(
          webRoot,
          "node_modules/tailwindcss/index.css",
        ),
      },
    ],
  },
};
