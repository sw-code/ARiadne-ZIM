// ignore styling for a better git diff. remove these comments some time after merging.
// prettier-ignore
export default {
  expo: {
    "name": "ARiadne",
    "slug": "ariadne-demo-app",
    authors: "swcode.io",
    "newArchEnabled": true,
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon-1024.png",
    "userInterfaceStyle": "light",
    "splash": {
      "image": "./assets/icon-1024.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "assetBundlePatterns": ["**/*"],
    "ios": {
      bundleIdentifier: "io.swcode.ariadne-demo-app",
      "supportsTablet": false,
      "infoPlist": {
        "NSPhotoLibraryUsageDescription": "Allow $(PRODUCT_NAME) to access your photos",
        "NSPhotoLibraryAddUsageDescription": "Allow $(PRODUCT_NAME) to save photos",
        "NSCameraUsageDescription": "Required for an interactive augmented reality experience",
        "NSMicrophoneUsageDescription": "Allow $(PRODUCT_NAME) to use your microphone"
      }
    },
    // iOS shows its permission prompts in the app language, using these texts instead of the English ones above.
    // Build variables like $(PRODUCT_NAME) are not expanded in translations, so the name is spelled out.
    locales: {
      de: {
        ios: {
          NSPhotoLibraryUsageDescription: "Erlaube ARiadne den Zugriff auf deine Fotos",
          NSPhotoLibraryAddUsageDescription: "Erlaube ARiadne, Fotos zu speichern",
          NSCameraUsageDescription: "Wird für ein interaktives Augmented-Reality-Erlebnis benötigt",
          NSMicrophoneUsageDescription: "Erlaube ARiadne, dein Mikrofon zu verwenden",
          NSLocationWhenInUseUsageDescription: "Wir müssen wissen, wo du bist, um dich zu deinem Ziel zu führen.",
          NSLocationAlwaysAndWhenInUseUsageDescription: "Erlaube ARiadne, deinen Standort für AR-Erlebnisse zu verwenden",
          NSLocationAlwaysUsageDescription: "Erlaube ARiadne den Zugriff auf deinen Standort",
          NSMotionUsageDescription: "Wir müssen wissen, in welche Richtung wir dich führen sollen.",
        },
      },
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/android-adaptive-icon-1024.png",
        "backgroundColor": "#ffffff"
      },
      "package": "io.swcode.ariadne_demo_app",
      "blockedPermissions": ["ACTIVITY_RECOGNITION"]
    },
    "androidStatusBar": {
      "barStyle": "dark-content",
      "backgroundColor": "#ffffff"
    },
    "web": {
      "favicon": "./assets/icon-512.png"
    },
    "plugins": [
      [
        "@reactvision/react-viro",
        {
          googleCloudApiKey: getGeospatialARCoreApiKey(),
          provider: "arcore",
          android: { xRMode: ["AR"] },
        },
      ],
      "@reactvision/react-viro-onnx",
      "./plugins/withMapLibrePodfile",
      "./plugins/withCoreMLForArCoreSemantics",
      "expo-asset",
      "expo-audio",
      // also lets users pick the app language in the system settings (Android 13+, iOS)
      ["expo-localization", { supportedLocales: ["en", "de"] }],
      [
        "expo-build-properties",
        {
          "android": {
            "compileSdkVersion": 36,
            "targetSdkVersion": 36,
            "buildToolsVersion": "36.0.0"
          },
          "ios": {
            // the prebuilt ViroKit binary requires 17.6, although its podspec claims less
            "deploymentTarget": "17.6",
            // Viro links all pods as dynamic frameworks for ARCore.
            // Pods depending on React-Core then fail to link against the precompiled React Native.
            "buildReactNativeFromSource": true
          }
        }
      ],
      [
        "expo-location",
        {
          "locationWhenInUsePermission": "We need to know where you are to guide you to your destination."
        }
      ],
      [
        "expo-sensors",
        {
          "motionPermission": "We need to know which direction to guide you in."
        }
      ],
      [
        "expo-splash-screen",
        {
          "backgroundColor": "#ffffff",
          "image": "./assets/icon-1024.png",
          "imageWidth": 200
        }
      ]
    ]
  }
};

// must be copy-pasted because this file cannot use imports :(
export function getGeospatialARCoreApiKey() {
  return validate(process.env["GEOSPATIAL_ARCORE_KEY"], "Google Geospatial ARCore API Key");
}

function validate(value: string | undefined, name: string): string {
  if (!value || value.length === 0) {
    throw new Error(
      `Missing required environment variable: '${name}'. Add it to your .env file. Check company Bitwarden or use your own.`,
    );
  }

  return value;
}
