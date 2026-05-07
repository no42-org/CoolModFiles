import React from "react";
import type { AppProps } from "next/app";
import "@fontsource/press-start-2p";
import "react-toastify/dist/ReactToastify.css";
import "../styles/app.scss";
import "rc-slider/assets/index.css";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <div>
      <Component {...pageProps} />
    </div>
  );
}

export default MyApp;
