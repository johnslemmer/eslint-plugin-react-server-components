import { ClientComponents } from "./rules/use-client";

export const rules = {
  "use-client": ClientComponents,
};

export const configs = {
  recommended: {
    rules: {
      "react-server-components/use-client": "error",
    },
    plugins: {
      "react-server-components": {
        rules,
      },
    },
  },
};
