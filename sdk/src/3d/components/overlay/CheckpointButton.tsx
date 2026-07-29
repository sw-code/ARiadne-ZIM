import React, { useState } from "react";
import { Button } from "@/src/ui/components/Button";
import { positioningLogLine } from "@/src/3d/positioningLog";
import { currentAbsoluteTime } from "@/src/shared/ReactExtensions";
import { log } from "@/src/shared/Logger";

// The tester taps this while standing on a surveyed checkpoint. Only the tap time is logged:
// the evaluation looks up the camera and every positioning estimate at that time in the positioning log.
export function CheckpointButton() {
  const [nextCheckpointNumber, setNextCheckpointNumber] = useState(1);

  const markCheckpoint = () => {
    log.info(
      positioningLogLine({
        kind: "Checkpoint",
        atSeconds: currentAbsoluteTime().nowSeconds,
        checkpointNumber: nextCheckpointNumber,
      }),
    );
    setNextCheckpointNumber(nextCheckpointNumber + 1);
  };

  return (
    <Button
      title={`Checkpoint ${nextCheckpointNumber}`}
      onPress={markCheckpoint}
      variant="primary"
      startIcon="map-pin"
      size="big"
    />
  );
}
