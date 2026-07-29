import { useEffect, useState } from "react";
import { Asset } from "expo-asset";
import { Directory, File, Paths } from "expo-file-system";
import { log } from "@/src/shared/Logger";

export type AssetModulesByFileName = Readonly<Record<string, number>>;

// Filled once per app session, so that remounting components do not rewrite files a native loader is still reading.
const filledDirectories = new Map<string, Promise<Directory>>();

/// Copies bundled assets into one cache directory under the given file names,
/// for native loaders that look up sibling files by their original name.
export function useAssetsInDirectory(directoryName: string, assetModulesByFileName: AssetModulesByFileName) {
  const [directory, setDirectory] = useState<Directory | null>(null);

  useEffect(() => {
    let isMounted = true;

    fillDirectoryOnceAsync(directoryName, assetModulesByFileName)
      .then((filledDirectory) => {
        if (isMounted) setDirectory(filledDirectory);
      })
      .catch((error) => log.error(`ASSETS | Failed to copy assets into directory '${directoryName}'`, error));

    return () => {
      isMounted = false;
    };
  }, [directoryName, assetModulesByFileName]);

  return directory;
}

function fillDirectoryOnceAsync(directoryName: string, assetModulesByFileName: AssetModulesByFileName) {
  let filledDirectory = filledDirectories.get(directoryName);

  if (!filledDirectory) {
    filledDirectory = fillDirectoryAsync(directoryName, assetModulesByFileName).catch((error) => {
      filledDirectories.delete(directoryName);
      throw error;
    });
    filledDirectories.set(directoryName, filledDirectory);
  }

  return filledDirectory;
}

async function fillDirectoryAsync(directoryName: string, assetModulesByFileName: AssetModulesByFileName) {
  // recreated instead of reused, because an app update may have changed the assets
  const directory = new Directory(Paths.cache, directoryName);
  if (directory.exists) directory.delete();
  directory.create();

  for (const [fileName, assetModule] of Object.entries(assetModulesByFileName)) {
    const assetFile = await downloadIntoFileAsync(assetModule);
    assetFile.copy(new File(directory, fileName));
  }

  return directory;
}

async function downloadIntoFileAsync(assetModule: number): Promise<File> {
  // In Android release builds, Asset.fromModule() marks images as already downloaded
  // and only sets their drawable resource name as localUri, which is not a file.
  // An asset without image dimensions is copied out of the APK resources instead.
  const { name, type, hash, uri } = Asset.fromModule(assetModule);
  const { localUri } = await new Asset({ name, type, hash, uri }).downloadAsync();
  if (!localUri) throw new Error(`Asset '${name}.${type}' could not be downloaded into a file`);

  return new File(localUri);
}
