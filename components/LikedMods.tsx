import React from "react";
import LikedMod, { FavoriteTrack } from "./LikedMod";

type LikedModsProps = {
  content: FavoriteTrack[];
  onPlay: (track: FavoriteTrack) => void;
  removeFavoriteModRuntime: (id: number, index?: number) => void;
};

function LikedMods({
  content,
  onPlay,
  removeFavoriteModRuntime,
}: LikedModsProps) {
  if (!content.length) {
    return (
      <ol>
        <li>Add some cool mod files here!</li>
      </ol>
    );
  } else {
    return (
      <ol>
        {content.map((track, index) => (
          <LikedMod
            track={track}
            index={index}
            onPlay={onPlay}
            removeFavoriteModRuntime={removeFavoriteModRuntime}
            key={index}
          />
        ))}
      </ol>
    );
  }
}

export default LikedMods;
