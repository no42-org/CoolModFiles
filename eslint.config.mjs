import nextConfig from "eslint-config-next/core-web-vitals";

const config = [
  ...nextConfig,
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "node_modules/**",
      "public/libopenmpt.js",
      "public/chiptune2.js",
      "mods/**",
      "openspec/**",
    ],
  },
  {
    rules: {
      // The pattern `useEffect(() => { if (event) setState(...) }, [event])`
      // is intentional throughout the codebase: it reacts to one-shot
      // user input (enterKey starts the player) or to async-discovered
      // capability (LIBRARY_ROOT probe → tab + breadcrumb). The new
      // react-hooks/set-state-in-effect rule (eslint-plugin-react-hooks v6+)
      // flags these; we accept the pattern.
      "react-hooks/set-state-in-effect": "warn",
      // Player.tsx's keyboard useEffect references a dozen handler
      // functions (togglePlay, playNext, etc.) declared as `const`
      // arrow functions later in the component body — the
      // pre-React-Compiler "stable closure over component scope"
      // pattern. The react-hooks/immutability rule (eslint-plugin-
      // react-hooks v7+) flags these as "accessed before declared".
      // The forward-reference is safe at runtime because the useEffect
      // callback only executes after the component body finishes. A
      // future React Compiler adoption will need to either hoist or
      // useCallback-wrap these handlers.
      "react-hooks/immutability": "warn",
      // pages/_document.js loads chiptune2.js and libopenmpt.js
      // synchronously by design — the WASM-backed audio engine has to
      // initialize before the React app boots so Player can use it on
      // first mount. Async loading would require a coordination hook
      // we don't have today.
      "@next/next/no-sync-scripts": "warn",
    },
  },
];

export default config;
