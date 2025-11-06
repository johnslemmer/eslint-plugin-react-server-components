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

// Default export for ESLint 9 flat config
export default {
  rules,
  configs,
};
