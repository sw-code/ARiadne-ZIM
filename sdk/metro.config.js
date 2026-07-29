// this file is required for telling expo how viro needs assets to be included in the build
const { getDefaultConfig } = require("expo/metro-config");
const defaultConfig = getDefaultConfig(__dirname);

// list the asset types to be included in the build
const extraAssetExts = ["glb", "gltf", "vrx", "bin", "arobject", "hdr", "onnx"];
defaultConfig.resolver.assetExts = [...defaultConfig.resolver.assetExts, ...extraAssetExts];

// remove the 3d assets types from source code files,
// otherwise it will try to build the assets as text files
defaultConfig.resolver.sourceExts = [
  ...defaultConfig.resolver.sourceExts.filter((ext) => !extraAssetExts.includes(ext)),
];

// this is required by viro
defaultConfig.transformer = {
  ...defaultConfig.transformer,
  assetPlugins: ["expo-asset/tools/hashAssetFiles"],
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  }),
};

module.exports = defaultConfig;
