/* eslint-disable @typescript-eslint/no-require-imports */
import { useEffect } from "react";
import { AudioPlayer, setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { AbsoluteTime, useTimeInterval } from "@/src/shared/ReactExtensions";
import { log } from "@/src/shared/Logger";
import { navigationSoundFor, NavigationSound } from "@/src/3d/navigation";

const barkingSound = require("@assets/3d/sounds/mixkit-dog-barking-twice-1.wav");
const wrongDirectionSound = require("@assets/3d/sounds/mixkit-click-error-1110.wav");
const dangerSound = require("@assets/3d/sounds/mixkit-battleship-alarm-1001.wav");

export type NavigationAudioMode = "correct direction" | "wrong direction" | "danger";

const repeatIntervalSeconds: Record<"wrong direction" | "danger", number> = {
  "wrong direction": 3,
  danger: 1,
};

// Plays navigation feedback sounds imperatively via expo-audio. Viro's own audio (spatial and
// plain) produces no output on this setup, so audio is deliberately decoupled from the Viro render
// tree. `mode` is null when there is no navigation target (no route yet) — then we stay silent.
export function useNavigationAudio(
  mode: NavigationAudioMode | null,
  navigator: "dog" | "line",
  time: AbsoluteTime,
): void {
  const barkingPlayer = useAudioPlayer(barkingSound);
  const wrongPlayer = useAudioPlayer(wrongDirectionSound);
  const dangerPlayer = useAudioPlayer(dangerSound);

  // Play through the media volume even when the phone's ringer is on silent (iOS); harmless on
  // Android.
  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  const intervalSeconds = mode === "wrong direction" || mode === "danger" ? repeatIntervalSeconds[mode] : 1;
  const tick = useTimeInterval(intervalSeconds, time, (t) => Math.floor(t.nowSeconds / intervalSeconds));

  // Fires on every mode switch and interval tick — i.e. each time we (re)play a sound.
  useEffect(() => {
    const selectedSound: NavigationSound | null = navigationSoundFor(mode, navigator);
    if (!selectedSound) return;

    const playerOfSound: Record<NavigationSound, AudioPlayer> = {
      barking: barkingPlayer,
      "wrong direction": wrongPlayer,
      danger: dangerPlayer,
    };

    const player = playerOfSound[selectedSound];
    player.seekTo(0);
    player.play();
    log.info("NavigationAudio | play", { mode, navigator, sound: selectedSound, tick });
  }, [mode, navigator, tick, barkingPlayer, wrongPlayer, dangerPlayer]);
}
