import type { NextConfig } from "next";
import "dotenv/config";

const config: NextConfig = {
  output: "standalone",
  env: {
    DOMAIN: process.env.DOMAIN,
  },
};

export default config;
