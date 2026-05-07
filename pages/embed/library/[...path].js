import React from "react";
import { useRouter } from "next/router";

import EmbedPlayer from "../../../components/embed/EmbedPlayer";
import { library } from "../../../components/sources";

function EmbedLibrary() {
  const router = useRouter();
  const { path: segments, title } = router.query;
  const filePath = Array.isArray(segments) ? segments.join("/") : segments;
  return (
    <EmbedPlayer
      initialSource={filePath ? library(filePath) : null}
      sharedTitle={title}
    />
  );
}

EmbedLibrary.type = "Embed";

export default EmbedLibrary;
