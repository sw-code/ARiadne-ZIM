const { withXcodeProject } = require("expo/config-plugins");

// ARCore Scene Semantics runs its segmentation model with CoreML,
// but the ARCore/Semantics pod does not declare that framework, so linking the app fails without it.
module.exports = function withCoreMLForArCoreSemantics(config) {
  return withXcodeProject(config, (config) => {
    config.modResults.addFramework("CoreML.framework");
    return config;
  });
};
