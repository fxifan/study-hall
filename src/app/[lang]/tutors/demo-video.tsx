"use client";

import { useEffect, useRef } from "react";

/**
 * The demo recording with its background music. The screen recording has no sound, so the music
 * is a separate track (an original piece composed for this page) that follows the video: it plays,
 * pauses, seeks and stops with it, and uses the video's own volume and mute controls. Nothing
 * plays until the visitor presses play.
 */
export function DemoVideo({ src, poster, music, captionId }: { src: string; poster: string; music: string; captionId: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const v = video.current;
    const a = audio.current;
    if (!v || !a) return;
    const sync = () => {
      if (Math.abs(a.currentTime - v.currentTime) > 0.25) a.currentTime = Math.min(v.currentTime, a.duration || v.currentTime);
    };
    const play = () => {
      sync();
      a.play().catch(() => undefined);
    };
    const pause = () => a.pause();
    const volume = () => {
      a.volume = v.volume * 0.6; // background level, under anything on screen
      a.muted = v.muted;
    };
    const ended = () => {
      a.pause();
      a.currentTime = 0;
    };
    volume();
    v.addEventListener("play", play);
    v.addEventListener("pause", pause);
    v.addEventListener("seeked", sync);
    v.addEventListener("ratechange", () => (a.playbackRate = v.playbackRate));
    v.addEventListener("volumechange", volume);
    v.addEventListener("ended", ended);
    v.addEventListener("waiting", pause);
    v.addEventListener("playing", play);
    return () => {
      v.removeEventListener("play", play);
      v.removeEventListener("pause", pause);
      v.removeEventListener("seeked", sync);
      v.removeEventListener("volumechange", volume);
      v.removeEventListener("ended", ended);
      v.removeEventListener("waiting", pause);
      v.removeEventListener("playing", play);
    };
  }, []);

  return (
    <>
      <video ref={video} controls preload="none" poster={poster} playsInline width={1280} height={800} aria-describedby={captionId}>
        <source src={src} type="video/webm" />
        Your browser can&apos;t play this video. <a href={src}>Download the demo (WebM)</a>.
      </video>
      <audio ref={audio} src={music} preload="none" aria-hidden="true" />
    </>
  );
}
