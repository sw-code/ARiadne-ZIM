The guide dog model is not part of this repository. To build the app, add these files to this folder:

- `RGB.png`, `1_normal.png` and `1_smoothness.png` from the free Unity Asset Store package
  [3D Stylized Animated Dogs Kit](https://assetstore.unity.com/packages/3d/characters/animals/mammals/3d-stylized-animated-dogs-kit-284699)
- `pug.vrx`, converted from `pug.fbx` of the same package with Viro's converter, which runs only on macOS:

```bash
node_modules/@reactvision/react-viro/bin/ViroFBX pug.fbx pug.vrx
```
