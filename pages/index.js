import React from "react";
import Head from "next/head";

import Player from "../components/Player";
import Footer from "../components/Footer";
import SourceTabs from "../components/SourceTabs";
import LocalCatalog from "../components/local/LocalCatalog";
import { modArchive } from "../components/sources";
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
  const playerRef = React.useRef(null);
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
            showLibrary={false}
          />
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

Index.getInitialProps = async ({ query }) => {
  const gh_req = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    },
    body: JSON.stringify({
      query: `{
      repository(owner: "orhun", name: "CoolModFiles") {
        content: object(expression: "master:HELP.md") {
          ... on Blob {
            text
          }
        }
      }
    }`,
    }),
  });
  const rss_req = await fetch(
    "https://modarchive.org/rss.php?request=uploads",
    {
      method: "GET",
    }
  );
  const json = await gh_req.json();
  const rss = await rss_req.text();
  let latestId;
  try {
    latestId = rss.split("downloads.php?moduleid=")[1].split("#")[0];
  } catch {
    latestId = RANDOM_MAX;
  }
  return {
    trackId: query.trackId,
    initialSource: query.trackId ? modArchive(Number(query.trackId)) : null,
    backSideContent: json.data?.repository?.content?.text,
    latestId,
  };
};

export default Index;
