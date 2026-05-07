import React from "react";
import styles from "./LikedMods.module.scss";

function LikedMod({ track, index, onPlay, removeFavoriteModRuntime }) {
  return (
    <li className={styles.likedMod} key={index}>
      <div
        id={`liked_mod_${track.id}`}
        onClick={() => onPlay(track)}
        title={
          `#${track.id}` +
          ` - ${track.artist || "[No Artist]"}` +
          ` - ${track.title || "[No Title]"}`
        }
      >
        {getSanitizedTrackTitle(track)}
      </div>
      <div
        id={`removes_${track.id}`}
        onClick={() => removeFavoriteModRuntime(track.id, index)}
      >
        x
      </div>
    </li>
  );
}

function getSanitizedTrackTitle(track) {
  if (track.title) {
    if (track.title.length == (track.title.match(/[^a-zA-Z ]/g) || []).length) {
      return "\uFFFD".repeat(3);
    } else {
      return track.title;
    }
  } else {
    return `#${track.id}`;
  }
}

export default LikedMod;
