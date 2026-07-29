# Dog model

`shiba-inu.glb` is the "ShibaInu" of Quaternius'
[Ultimate Animated Animal Pack](https://quaternius.com/packs/ultimateanimatedanimals.html) (CC0, see
[ASSET_SOURCES.md](../ASSET_SOURCES.md)).
The app uses its animations `Idle`, `Walk` and `Gallop`.

To regenerate it:

1. Download `glTF/ShibaInu.gltf` from the pack.
2. Repackage it as GLB without changes: `npx @gltf-transform/cli copy ShibaInu.gltf ../../../assets-src/dog/shiba-inu.glb`
3. Optimize it into this folder: `npm run gen-glb` (in `sdk/`)
