import React from "react";
import Head from "next/head";

import Player from "../components/Player";
import Footer from "../components/Footer";
import SourceTabs from "../components/SourceTabs";
import LocalCatalog from "../components/local/LocalCatalog";
import LibraryCatalog from "../components/library/LibraryCatalog";
import { modArchive, library } from "../components/sources";
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

function Index({ trackId, initialSource, backSideContent, latestId }) {
  const [start, setStart] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState("random");
  const [pickedFiles, setPickedFiles] = React.useState([]);
  const [libraryPath, setLibraryPath] = React.useState("");
  const [libraryAvailable, setLibraryAvailable] = React.useState(false);
  const playerRef = React.useRef(null);
  const [randomMsg, setRandomMsg] = React.useState(
    getRandomFromArray(getRandomInt(0, 158) ? MESSAGES : EE_MESSAGES)
  );

  // Probe whether the server has LIBRARY_ROOT configured. The Library tab
  // is hidden when the API returns 404.
  React.useEffect(() => {
    fetch("/api/library?path=")
      .then((r) => setLibraryAvailable(r.ok))
      .catch(() => setLibraryAvailable(false));
  }, []);

  // When arriving via a library permalink, switch to the Library tab and
  // open the catalog at the file's parent directory so the breadcrumb
  // reflects context.
  React.useEffect(() => {
    if (initialSource?.type === "library" && libraryAvailable) {
      setActiveTab("library");
      const parts = initialSource.path.split("/");
      parts.pop();
      setLibraryPath(parts.join("/"));
    }
  }, [initialSource, libraryAvailable]);

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
    if (sessionStorage.getItem("refresh") === "true"){
      setRandomMsg(getRandomFromArray(REFRESH_MESSAGES))
    } else {
      sessionStorage.setItem("refresh", "true")
    }
    document.getElementById(
      "app"
    ).style.backgroundImage = `url('/images/${getRandomFromArray(BG_IMAGES)}')`;
  }, []);

  if (start) {
    return (
      <React.Fragment>
        <Head>
          <title>CoolModFiles.com - Play some cool MOD files!</title>
        </Head>
        <div id="app">
          <SourceTabs
            activeTab={activeTab}
            onChange={setActiveTab}
            showLibrary={libraryAvailable}
          />
          {activeTab === "library" && libraryAvailable && (
            <LibraryCatalog
              currentPath={libraryPath}
              setCurrentPath={setLibraryPath}
              onPlay={(source) => playerRef.current?.playSource(source)}
            />
          )}
          {activeTab === "local" && (
            <LocalCatalog
              pickedFiles={pickedFiles}
              setPickedFiles={setPickedFiles}
              onPlay={(source) => playerRef.current?.playSource(source)}
            />
          )}
          <Player
            ref={playerRef}
            initialSource={initialSource}
            backSideContent={backSideContent}
            latestId={latestId}
            pickedFiles={pickedFiles}
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

export async function getServerSideProps({ query }) {
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

  let latestId;
  try {
    const rss_req = await fetch(
      "https://modarchive.org/rss.php?request=uploads",
      { method: "GET" }
    );
    const rss = await rss_req.text();
    latestId = rss.split("downloads.php?moduleid=")[1].split("#")[0];
  } catch {
    latestId = RANDOM_MAX;
  }

  let initialSource = null;
  if (query.source === "modarchive" && query.id) {
    initialSource = modArchive(Number(query.id));
  } else if (query.source === "library" && query.path) {
    initialSource = library(String(query.path));
  } else if (query.trackId) {
    initialSource = modArchive(Number(query.trackId));
  }

  return {
    props: {
      trackId: query.trackId || null,
      initialSource,
      backSideContent,
      latestId,
    },
  };
}

export default Index;
