const { withDangerousMod } = require("expo/config-plugins");
const files = require("node:fs");
const path = require("node:path");

const postInstallBlockStart = "post_install do |installer|";

// Replaces the "@maplibre/maplibre-react-native" config plugin, whose only essential job on iOS
// is this Podfile hook that links the MapLibre Swift package.
// That plugin edits the Podfile in a regular Podfile mod, which runs after all dangerous mods.
// The Viro plugin rewrites the Podfile in a dangerous mod without awaiting the file operations,
// so a later Podfile mod can read a half-written, empty file.
// Mods run in reverse plugin order, so listing this plugin after Viro edits the Podfile before Viro starts.
module.exports = function withMapLibrePodfile(config) {
  return withDangerousMod(config, [
    "ios",
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, "Podfile");
      const podfile = files.readFileSync(podfilePath, "utf8");

      if (!podfile.includes(postInstallBlockStart)) {
        throw new Error(`MapLibre | Missing '${postInstallBlockStart}' in ${podfilePath}`);
      }

      const hook = `${postInstallBlockStart}\n    $MLRN.post_install(installer)`;
      files.writeFileSync(podfilePath, podfile.replace(postInstallBlockStart, hook), "utf8");
      return config;
    },
  ]);
};
