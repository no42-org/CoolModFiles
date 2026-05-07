import React from "react";
import { useRouter } from "next/router";

import EmbedPlayer from "../../components/embed/EmbedPlayer";
import { modArchive } from "../../components/sources";

function Embed() {
  const router = useRouter();
  const { trackId, title } = router.query;
  const id = Array.isArray(trackId) ? trackId[0] : trackId;
  const sharedTitle = Array.isArray(title) ? title[0] : title;
  return (
    <EmbedPlayer
      initialSource={id ? modArchive(Number(id)) : null}
      sharedTitle={sharedTitle}
    />
  );
}

Embed.type = "Embed";

export default Embed;
