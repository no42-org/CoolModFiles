import React from "react";
import Head from "next/head";
import type { GetServerSideProps } from "next";

import Player from "../components/Player";
import Footer from "../components/Footer";
import { modArchive, library, type Source } from "../components/sources";
import {
  getRandomInt,
  getRandomFromArray,
  RANDOM_MAX,
  MESSAGES,
  EE_MESSAGES,
  MOBILE_MESSAGES,
  BG_IMAGES,
  REFRESH_MESSAGES,
} from "../utils";
import { useKeyPress } from "../hooks";
import { isMobile } from "react-device-detect";

type IndexProps = {
  trackId: string | null;
  initialSource: Source | null;
  backSideContent?: string;
  latestId: number;
};

function Index({
  trackId,
  initialSource,
  backSideContent,
  latestId,
}: IndexProps) {
  const [start, setStart] = React.useState(false);
  const [randomMsg, setRandomMsg] = React.useState(
    getRandomFromArray(getRandomInt(0, 158) ? MESSAGES : EE_MESSAGES)
  );

  const getMessage = () => {
    if (isMobile) {
      return getRandomFromArray(MOBILE_MESSAGES);
    } else if (trackId) {
      return `Play the track #${trackId}`;
    } else {
      return randomMsg;
    }
  };

  const enterKey = useKeyPress("Enter");

  React.useEffect(() => {
    if (enterKey) setStart(true);
  }, [enterKey]);

  React.useEffect(() => {
    if (sessionStorage.getItem("refresh") === "true") {
      setRandomMsg(getRandomFromArray(REFRESH_MESSAGES));
    } else {
      sessionStorage.setItem("refresh", "true");
    }
    const el = document.getElementById("app");
    if (el) {
      el.style.backgroundImage = `url('/images/${getRandomFromArray(BG_IMAGES)}')`;
    }
  }, []);

  if (start) {
    return (
      <React.Fragment>
        <Head>
          <title>CoolModFiles.com - Play some cool MOD files!</title>
        </Head>
        <div id="app">
          <Player
            initialSource={initialSource}
            backSideContent={backSideContent}
            latestId={latestId}
          />
          <Footer />
        </div>
      </React.Fragment>
    );
  }
  return (
    <React.Fragment>
      <Head>
        <title>CoolModFiles.com - Play some cool MOD files!</title>
      </Head>
      <div id="app">
        <div className="randombtn" onClick={() => setStart(true)}>
          <p suppressHydrationWarning>{getMessage()}</p>
        </div>
      </div>
    </React.Fragment>
  );
}

export const getServerSideProps: GetServerSideProps<IndexProps> = async ({
  query,
}) => {
  const fs = await import("fs/promises");
  const path = await import("path");

  let backSideContent = "";
  try {
    backSideContent = await fs.readFile(
      path.join(process.cwd(), "HELP.md"),
      "utf8"
    );
  } catch {
    backSideContent = "";
  }

  let latestId: number;
  try {
    const rss_req = await fetch(
      "https://modarchive.org/rss.php?request=uploads",
      { method: "GET" }
    );
    const rss = await rss_req.text();
    latestId = Number(rss.split("downloads.php?moduleid=")[1].split("#")[0]);
  } catch {
    latestId = RANDOM_MAX;
  }

  let initialSource: Source | null = null;
  if (query.source === "modarchive" && query.id) {
    initialSource = modArchive(Number(query.id));
  } else if (query.source === "library" && query.path) {
    initialSource = library(String(query.path));
  } else if (query.trackId) {
    initialSource = modArchive(Number(query.trackId));
  }

  return {
    props: {
      trackId: typeof query.trackId === "string" ? query.trackId : null,
      initialSource,
      backSideContent,
      latestId,
    },
  };
};

export default Index;
