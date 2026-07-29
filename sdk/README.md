# ARiadne SDK

Augmented Reality navigation system built with React Native and Expo.

## Quick Start

```bash
npm install

# Required because of viro
npm run build

# Start development server (needs physical phone via usb connection)
npm run android

# or: npm run ios
```

Note that this project does not support phone emulators, as they are usually not capable of AR.
So, make sure to connect your real device.

### iOS

Building for iOS requires macOS with Xcode and CocoaPods (`brew install cocoapods`), and an iPhone with iOS 17.6 or newer.
On macOS, `npm run build` also runs `pod install`, which downloads the ARCore SDK and ONNX Runtime the first time.

- Enable Developer Mode on the iPhone (Settings → Privacy & Security → Developer Mode).
- `npm run ios` asks for a signing team on the first run.
  Alternatively, open `ios/ARiadne.xcworkspace` in Xcode and choose a team under Signing & Capabilities.
- VPS on iOS uses the same `GEOSPATIAL_ARCORE_KEY`. If that key is restricted to Android apps in the Google Cloud Console,
  also allow the iOS bundle identifier `io.swcode.ariadne-demo-app`.

### Note: Patching MainApplication.kt

With the current expo and viro version, the Android MainApplication.kt will not be generated correctly during `npm run build`.
We can't use latest viro version, because a regression that ignores all viro node transforms.
Therefore, we added a script to fix it, which will automatically be run when you execute the build command.

## Other useful scripts

- `npm run test` - Execute the testsuite
- `npm run type-check` - TypeScript type checking
- `npm run lint` - ESLint code quality check (you should run this before opening a pull request)
- `npm run format` - Perform code formatting (you should run this before opening a pull request)
- `npm run gen-glb` - Optimize the GLB models in `assets-src/` into `assets/3d/`

We recommend configuring your editor to perform this formatting on every file save.

New 3D models and sounds must allow redistribution in a public source repository (CC0, CC BY 4.0 or self-made).
Record their source and license in [assets/3d/ASSET_SOURCES.md](assets/3d/ASSET_SOURCES.md).

# The stack (the configs)

- Typescript: Static typing to fix javascript.
- Eslint: Additional problem detection to fix typescript.
- Expo: The system generating android and ios projects, internally using react native.
- App.json: Used by expo to generate the android and ios folders.
- React Native: React (js), but it renders native widgets, for ios and android. Used by expo.
- Metro: The server system of react native, which is used indirectly by expo.
- Babel: The bundler used by metro, indirectly used by metro, which is used by react native, which is used by expo.
- Jest: The testing framework used with react native.
- Prettier: The source code formatting tool.

## Pull request checks

GitHub Actions runs quality checks on every push/PR:

- TypeScript type checking
- ESLint code quality
- Prettier formatting validation

## Clear everything and rebuild Android from scratch in Windows Powershell

`Remove-Item -Recurse -Force .expo -ErrorAction SilentlyContinue; Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue; Remove-Item -Recurse -Force android -ErrorAction SilentlyContinue; Remove-Item -Recurse -Force ios -ErrorAction SilentlyContinue; npm install; npm run build; npm run android`

## Use of external API and secure API keys

To use external APIs and secure API keys create an `.env` file in the root of the sdk and add following entries:

```
EXPO_PUBLIC_API_MAPTILER_KEY=yourkey123
EXPO_PUBLIC_API_GRAPHHOPPER_KEY=yourkey123
GEOSPATIAL_ARCORE_KEY=yourkey
EXPO_PUBLIC_CMS_BASE_URL=https://ariadne-cms.swcode.io
```

For instance, to load the env variables in code use process.env["EXPO_PUBLIC_API_PHOTON"].
For more information check https://docs.expo.dev/guides/environment-variables/

## Testing the navigation outdoors

When you use `npm run android`, it starts a dev server and needs a USB connection, which is good.
But this app will stop when you remove the USB connection.
If you want to test the app without wire connection because you want to go farther away,
you need to use a different command while USB is still connected:

```bash
npm run android:release

# or: npm run ios:release
```

After the command finishes, you can remove the USB wire connection and it will still work.

## Troubleshooting

### Windows: "Filename longer than 260 characters" during Android build

On Windows, the Android release build (`npm run android:release`) may fail with:

```
ninja: error: Stat(...): Filename longer than 260 characters
```

This happens because CMake embeds absolute source file paths into object file names.
Combined with deeply nested `node_modules` paths, this exceeds the Windows 260-character path limit.

**Workaround:** Use `subst` to map the repo to a short drive letter, then build from there:

```bash
subst Z: "C:\Users\YourName\Documents\Github\ARiadne"
cd Z:\sdk
npm run android:release
```

Note: Map the **repo root** (parent of `sdk/`), not the `sdk/` folder directly.
Mapping a drive root like `Z:\` directly to `sdk/` causes Metro bundler to fail at module resolution.

To remove the mapping afterwards: `subst Z: /d`
