module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        // this plugin allows us to import assets using a global path
        // e.g. import compassBodyAsset from "@assets/3d/compass_body.glb"
        // instead of forcing relative paths
        "module-resolver",
        {
          root: ["./"],
          alias: {
            "@": ".",
            "@assets": "./assets",
          },
        },
      ],
    ],
  };
};
