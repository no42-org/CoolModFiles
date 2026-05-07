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
