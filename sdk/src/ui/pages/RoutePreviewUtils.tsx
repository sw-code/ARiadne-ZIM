import { formatDecimal } from "@/src/shared/JavascriptExtensions";
import { Language } from "@/src/i18n/Translations";

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / (3600 * 24));
  const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);

  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}min`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}min`;
  } else if (minutes > 0) {
    return `${minutes}min`;
  } else {
    return `${seconds}s`;
  }
}

export function formatDistance(rawDistance: number, language: Language): string {
  if (rawDistance < 1000) {
    return `${Math.round(rawDistance)} m`;
  } else {
    const km = rawDistance / 1000;
    return `${formatDecimal(km, 1, language)} km`;
  }
}

export function fitCameraToBounds(
  camera: { fitBounds: (ne: number[], sw: number[], padding: number, duration: number) => void } | null,
  userLoc: number[],
  targetLoc: number[],
) {
  if (
    camera &&
    userLoc[0] !== undefined &&
    targetLoc[0] !== undefined &&
    targetLoc[1] !== undefined &&
    userLoc[1] !== undefined
  ) {
    const bounds = {
      ne: [Math.max(userLoc[0], targetLoc[0]), Math.max(userLoc[1], targetLoc[1])],
      sw: [Math.min(userLoc[0], targetLoc[0]), Math.min(userLoc[1], targetLoc[1])],
    };
    camera.fitBounds(bounds.ne, bounds.sw, 50, 200);
  }
}
