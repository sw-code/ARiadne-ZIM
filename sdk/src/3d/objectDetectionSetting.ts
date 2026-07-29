import { usePersistentState } from "@/src/shared/ReactExtensions";

export const OBJECT_DETECTION_ENABLED_STORAGE_KEY = "settings.objectDetectionEnabled";

// Release builds start with it switched off, because the inference costs a lot of AR frame rate
// and so far only the detection boxes use the detections.
export function useObjectDetectionSetting() {
  return usePersistentState(OBJECT_DETECTION_ENABLED_STORAGE_KEY, () => __DEV__);
}
