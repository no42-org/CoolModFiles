/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React from "react";
import styles from "./VersionLabel.module.scss";

function VersionLabel() {
  const version = process.env.APP_VERSION || "dev";
  return <div className={styles.label}>{version}</div>;
}

export default VersionLabel;
