import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenParams } from "@/App";
import { Button } from "../components/Button";
import { SegmentedControl } from "@/src/ui/components/SegmentedControl";

import { Text, View } from "react-native";
import React, { useState } from "react";
import { PointOfInterest } from "@/src/shared/poi";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { layout } from "@/src/shared/Styles";
import { Header } from "@/src/ui/components/Header";
import { Viro3DPoint } from "@reactvision/react-viro/dist/components/Types/ViroUtils";

type Props = NativeStackScreenProps<ScreenParams, "Testing">;

const headingWest = 0.75 * 360;
const headingEast = 0.25 * 360;

const navigationTargetSoest = { latitudeDegrees: 51.57052450428326, longitudeDegrees: 8.10600321028342 };

const locationsSoest = [
  [51.57045362195723, 8.10573462976483] as const,
  [51.57044778695, 8.105683667833961] as const,
  [51.57044737016155, 8.10563203528365] as const,
].map(([latitudeDegrees, longitudeDegrees]) => ({
  coordinate: { latitudeDegrees, longitudeDegrees },
  headingDegrees: headingWest,
}));

const locationsDusseldorf = [
  [51.21413521186651, 6.802037001339809] as const,
  [51.21418561683892, 6.802054435537763] as const,
  [51.21423602179429, 6.802058458707701] as const,
].map(([latitudeDegrees, longitudeDegrees]) => ({
  coordinate: { latitudeDegrees, longitudeDegrees },
  headingDegrees: headingEast,
}));

const locationsLippstadt = [
  [51.67368432486269, 8.362475367842583] as const,
  [51.67365065971912, 8.362478561272484] as const,
  [51.67360775317125, 8.362483883601152] as const,
].map(([latitudeDegrees, longitudeDegrees]) => ({
  coordinate: { latitudeDegrees, longitudeDegrees },
  headingDegrees: headingEast,
}));

const locationsLippstadtL3 = [
  [51.67362941157559, 8.363743086017683] as const,
  [51.673634020778074, 8.36393263311106] as const,
  [51.67361327763314, 8.36385272585981] as const,
].map(([latitudeDegrees, longitudeDegrees]) => ({
  coordinate: { latitudeDegrees, longitudeDegrees },
  headingDegrees: 0,
}));

const peopleModelsA = [
  {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    modelPath: require("@assets/3d/testing/musician.glb"),
    id: "music-a",
    info: {
      name: "Live Musik (A)",
      description: "Jeden Samstag abend im Café",
      position: [0.4, 1.6, 0] satisfies Viro3DPoint,
    },
  },
  {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    modelPath: require("@assets/3d/testing/runner.glb"),
    id: "runner-a",
    info: {
      name: "Lauftreff (A)",
      description: "Jeden Montag 18:00 genau hier",
      position: [0.4, 1.6, 0] satisfies Viro3DPoint,
    },
  },
  {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    modelPath: require("@assets/3d/testing/vendor.glb"),
    id: "vendor-a",
    info: {
      name: "Markt (A)",
      description: "Jeden Samstag 10:00 genau hier",
      position: [0.4, 1.6, 0] satisfies Viro3DPoint,
    },
  },
];

const objectsModels = [
  {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    modelPath: require("@assets/3d/testing/guitar.glb"),
    id: "guitar",
    info: {
      name: "Live Musik",
      description: "Jeden Samstag abend im Café",
      position: [0.0, 0.3, 0] satisfies Viro3DPoint,
    },
  },
  {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    modelPath: require("@assets/3d/testing/shoes.glb"),
    id: "shoes",
    info: {
      name: "Lauftreff",
      description: "Jeden Montag 18:00 genau hier",
      position: [0.0, 0.3, 0] satisfies Viro3DPoint,
    },
  },
  {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    modelPath: require("@assets/3d/testing/apples.glb"),
    id: "apples",
    info: {
      name: "Markt",
      description: "Jeden Samstag 10:00 genau hier",
      position: [0.0, 0.3, 0] satisfies Viro3DPoint,
    },
  },
];

const footprintsModels = [
  {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    modelPath: require("@assets/3d/testing/footprints musician.glb"),
    id: "guitar",
    info: {
      name: "Live Musik",
      description: "Jeden Samstag abend im Café",
      position: [0.0, 0.3, 0] satisfies Viro3DPoint,
    },
  },
  {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    modelPath: require("@assets/3d/testing/footprints runner.glb"),
    id: "shoes",
    info: {
      name: "Lauftreff",
      description: "Jeden Montag 18:00 genau hier",
      position: [0.0, 0.3, 0] satisfies Viro3DPoint,
    },
  },
  {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    modelPath: require("@assets/3d/testing/footprints vendor.glb"),
    id: "apples",
    info: {
      name: "Markt",
      description: "Jeden Samstag 10:00 genau hier",
      position: [0.0, 0.3, 0] satisfies Viro3DPoint,
    },
  },
];

const signModels = [
  {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    modelPath: require("@assets/3d/testing/sign-music.glb"),
    id: "guitar-sign",
  },
  {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    modelPath: require("@assets/3d/testing/sign-runner.glb"),
    id: "shoes-sign",
  },
  {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    modelPath: require("@assets/3d/testing/sign-vendor.glb"),
    id: "apples-sign",
  },
];

const distribute = (pois: Omit<PointOfInterest, "location" | "category" | "subtype">[]): PointOfInterest[] =>
  [locationsSoest, locationsDusseldorf, locationsLippstadt, locationsLippstadtL3].flatMap(
    (sites, siteIndex): PointOfInterest[] =>
      pois.map((poi, poiIndex): PointOfInterest => {
        // These are hand-authored demo models rather than real OSM nodes, so we give them a
        // catch-all category and derive a subtype from the model id (for the profile to key on).
        return {
          category: "tourism",
          subtype: poi.id,
          ...poi,
          id: poi.id + "-" + siteIndex,
          location: sites[poiIndex]!,
        };
      }),
  );

const pointOfInterests: Record<ARMainSceneType, PointOfInterest[]> = {
  People: distribute(peopleModelsA),
  Objects: distribute(objectsModels),
  Footprints: distribute(footprintsModels),
  Signs: distribute(signModels),
};

export type ARMainSceneType = "Objects" | "People" | "Footprints" | "Signs";

export const Testing = ({ navigation }: Props) => {
  const sceneTypes: ARMainSceneType[] = ["Objects", "People", "Footprints", "Signs"];
  const [selectedExperiment, setExperiment] = useState<ARMainSceneType | null>(null);

  const insets = useSafeAreaInsets();

  type PlacementMode = "GPS" | "Manual";
  const [selectedPlacementMode, setSelectedPlacementMode] = useState<PlacementMode>("Manual");

  function onStart(sceneType: ARMainSceneType) {
    if (selectedPlacementMode === "GPS") {
      navigation.navigate("ARMain", {
        pointsOfInterest: pointOfInterests[sceneType],
        targetCoordinate: navigationTargetSoest,
        routeIntersections: [],
        navigationMode: "explore",
        navigator: "line",
      });
    } else {
      navigation.navigate("ARTesting", {
        pointsOfInterest: pointOfInterests[sceneType],
      });
    }
  }

  return (
    <>
      <Header onBack={navigation.goBack}></Header>
      <View style={{ ...insets }}>
        <View
          style={{
            ...layout.centeredColumn,
            gap: 40,
            height: "100%",
          }}
        >
          <Col gap={10}>
            <Text>3D Positioning</Text>

            <SegmentedControl<PlacementMode>
              options={[
                { value: "GPS", name: "Automatic" },
                { value: "Manual", name: "Manual" },
              ]}
              selectedValue={selectedPlacementMode}
              onValueChange={(itemValue) => setSelectedPlacementMode(itemValue)}
              direction={"vertical"}
            />
          </Col>

          <Col gap={10}>
            <Text>Experiment Variant</Text>
            <SegmentedControl<ARMainSceneType>
              options={sceneTypes.map((sceneType) => ({
                value: sceneType,
                name: "" + sceneType,
              }))}
              selectedValue={selectedExperiment}
              onValueChange={(itemValue) => setExperiment(itemValue)}
              direction={"vertical"}
            />
          </Col>

          <Button
            title={"Start experiment"}
            variant={"primary"}
            onPress={() => onStart(selectedExperiment!)}
            state={selectedExperiment ? "default" : "disabled"}
          />
        </View>
      </View>
    </>
  );
};

function Col(props: { gap: number; children: React.ReactNode }) {
  return (
    <View
      style={{
        ...layout.centeredColumn,
        gap: props.gap,
      }}
    >
      {props.children}
    </View>
  );
}
