# eslint-plugin-react-server-components

Experiment in making an ESLint rule for enforcing `"use client"` in client components (and warning if it's not needed).

## Installation

```bash
npm install --save-dev eslint-plugin-react-server-components
```

## Configuration

ESLint 9+ uses a flat config format. To use the recommended configuration:

```javascript
// eslint.config.js
import reactServerComponents from 'eslint-plugin-react-server-components';

export default [
  reactServerComponents.configs.recommended,
  // ... your other config
];
```

For manual configuration:

```javascript
// eslint.config.js
import reactServerComponents from 'eslint-plugin-react-server-components';

export default [
  {
    plugins: {
      'react-server-components': reactServerComponents,
    },
    rules: {
      'react-server-components/use-client': 'error',
    },
  },
];
```

## Rules

### `use-client`

> Enforce components are appropriately prefixed with `'use client'.`

**Options:**

```javascript
{
  rules: {
    "react-server-components/use-client": [
      "error",
      {
        allowedServerHooks: ["useTranslation"], // Optional: hooks that are allowed in server components
      },
    ],
  },
}
```
