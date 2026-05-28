"use client";

import { useEffect, useRef, useState } from "react";
import { Music2 } from "lucide-react";
import { cn } from "@/lib/utils";

const bgmTracks: Array<{ title: string; src: string }> = [
  {
    title: "你在暮色中",
    src: "/assets/bgm/dusk-healing.mp3",
  },
];

const defaultVolume = 0.42;
const entryAutoplaySessionKey = "echoverse.entry-autoplay-attempted";
const entryAutoplayRetryDelays = [0, 120, 360, 900, 1800, 3200] as const;

export function GlobalMusicButton() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const retryCleanupRef = useRef<(() => void) | null>(null);
  const manuallyPausedRef = useRef(false);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [starting, setStarting] = useState(false);
  const [bootstrapMuted, setBootstrapMuted] = useState(false);
  const track = bgmTracks[currentTrackIndex];
  const rotating = playing || starting;

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    audio.preload = "auto";
    audio.loop = bgmTracks.length === 1;
    audio.volume = defaultVolume;

    const handlePlay = () => {
      setPlaying(true);
      setStarting(false);
      setBlocked(false);
    };
    const handlePause = () => {
      setPlaying(false);
      setStarting(false);
    };
    const handleError = () => {
      setPlaying(false);
      setStarting(false);
      setBlocked(true);
    };
    const handleEnded = () => {
      playNextTrack();
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("playing", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("error", handleError);
    audio.addEventListener("ended", handleEnded);

    return () => {
      clearEntryAutoplayRetry();
      audio.pause();
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("playing", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;

    if (!track || !audio) {
      return;
    }

    manuallyPausedRef.current = false;
    audio.loop = bgmTracks.length === 1;
    audio.volume = defaultVolume;

    if (shouldAttemptEntryAutoplay()) {
      scheduleEntryAutoplayRetry();
      return;
    }

    clearEntryAutoplayRetry();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.src]);

  function clearEntryAutoplayRetry() {
    retryCleanupRef.current?.();
    retryCleanupRef.current = null;
  }

  function shouldAttemptEntryAutoplay() {
    if (typeof window === "undefined") {
      return false;
    }

    try {
      const navigationEntry = performance.getEntriesByType(
        "navigation",
      )[0] as PerformanceNavigationTiming | undefined;

      if (navigationEntry?.type === "reload") {
        sessionStorage.setItem(entryAutoplaySessionKey, "1");
        return false;
      }

      if (sessionStorage.getItem(entryAutoplaySessionKey) === "1") {
        return false;
      }

      sessionStorage.setItem(entryAutoplaySessionKey, "1");
      return true;
    } catch {
      return false;
    }
  }

  function scheduleEntryAutoplayRetry() {
    if (typeof window === "undefined") {
      return;
    }

    clearEntryAutoplayRetry();

    const timeouts: number[] = [];
    const tryEntryPlayback = () => {
      if (document.visibilityState !== "hidden" && !manuallyPausedRef.current) {
        void startPlayback({ useMutedBootstrap: true });
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        tryEntryPlayback();
      }
    };

    entryAutoplayRetryDelays.forEach((delay) => {
      timeouts.push(window.setTimeout(tryEntryPlayback, delay));
    });

    window.addEventListener("pageshow", tryEntryPlayback);
    window.addEventListener("focus", tryEntryPlayback);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    retryCleanupRef.current = () => {
      timeouts.forEach((timeout) => window.clearTimeout(timeout));
      window.removeEventListener("pageshow", tryEntryPlayback);
      window.removeEventListener("focus", tryEntryPlayback);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }

  function releaseBootstrapMute(audio: HTMLAudioElement) {
    setBootstrapMuted(false);
    audio.defaultMuted = false;
    audio.muted = false;
    audio.volume = defaultVolume;
  }

  function playNextTrack() {
    if (bgmTracks.length <= 1) {
      return;
    }

    setCurrentTrackIndex((index) => (index + 1) % bgmTracks.length);
  }

  async function startPlayback({
    useMutedBootstrap = false,
  }: {
    useMutedBootstrap?: boolean;
  } = {}) {
    const audio = audioRef.current;

    if (!audio || !track || manuallyPausedRef.current) {
      return false;
    }

    setStarting(true);

    try {
      releaseBootstrapMute(audio);
      await audio.play();

      if (manuallyPausedRef.current) {
        audio.pause();
        return false;
      }

      clearEntryAutoplayRetry();
      setPlaying(true);
      setBlocked(false);
      return true;
    } catch {
      if (useMutedBootstrap && !manuallyPausedRef.current) {
        try {
          setBootstrapMuted(true);
          audio.defaultMuted = true;
          audio.muted = true;
          audio.volume = defaultVolume;
          await audio.play();

          window.setTimeout(() => {
            const currentAudio = audioRef.current;

            if (currentAudio === audio && !manuallyPausedRef.current) {
              releaseBootstrapMute(currentAudio);
              clearEntryAutoplayRetry();
              setPlaying(!currentAudio.paused);
              setBlocked(currentAudio.paused);
            }
          }, 80);

          setPlaying(true);
          setBlocked(false);
          return true;
        } catch {
          releaseBootstrapMute(audio);
        }
      }

      setPlaying(false);
      setBlocked(true);
      return false;
    } finally {
      setStarting(false);
    }
  }

  async function toggleMusic() {
    const audio = audioRef.current;

    if (!audio || !track) {
      return;
    }

    if (playing) {
      manuallyPausedRef.current = true;
      clearEntryAutoplayRetry();
      audio.pause();
      audio.currentTime = 0;
      setPlaying(false);
      setBlocked(false);
      return;
    }

    manuallyPausedRef.current = false;

    try {
      await startPlayback();
    } catch {}
  }

  if (!track) {
    return null;
  }

  return (
    <>
      <audio
        ref={audioRef}
        src={track.src}
        muted={bootstrapMuted}
        playsInline
        preload="auto"
        loop={bgmTracks.length === 1}
        className="hidden"
        aria-hidden="true"
      />
      <button
        type="button"
        data-auth-allow="true"
        aria-label={playing ? "暂停背景音乐" : "播放背景音乐"}
        title={blocked ? "点击播放背景音乐" : playing ? "暂停背景音乐" : "播放背景音乐"}
        onClick={toggleMusic}
        className="music-orb-button fixed left-12 top-10 z-[60] grid place-items-center rounded-full"
      >
        <span
          className={cn(
            "music-orb-disc",
            rotating ? "music-orb-disc--playing" : "",
          )}
        >
          <span className="music-orb-groove music-orb-groove--outer" />
          <span className="music-orb-groove music-orb-groove--inner" />
          <span className="music-orb-core" />
          <Music2 className="music-orb-icon" />
        </span>
      </button>
    </>
  );
}
