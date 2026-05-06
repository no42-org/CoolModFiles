import React from "react";

import styles from "./Footer.module.scss";
import { GithubIcon } from "../icons";

function Footer() {
  return (
    <footer className={styles.footer}>
      <a href="https://github.com/no42-org/CoolModFiles" target="_blank">
        <GithubIcon height="40" width="40" />
      </a>
    </footer>
  );
}

export default Footer;
