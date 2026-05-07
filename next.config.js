require("dotenv").config();

module.exports = {
  output: "standalone",
  env: {
    DOMAIN: process.env.DOMAIN,
  },
};
