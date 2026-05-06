import React from "react";
import { useRouter } from "next/router";

import EmbedPlayer from "../../components/embed/EmbedPlayer";
import { modArchive } from "../../components/sources";

function Embed() {
  const router = useRouter();
  const { trackId, title } = router.query;
  return (
    <EmbedPlayer
      initialSource={trackId ? modArchive(Number(trackId)) : null}
      sharedTitle={title}
    />
  );
}

Embed.type = "Embed";

export default Embed;