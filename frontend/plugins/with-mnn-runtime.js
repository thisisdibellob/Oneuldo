const { withDangerousMod, withGradleProperties } = require('expo/config-plugins');
const { createHash } = require('node:crypto');
const { copyFile, mkdir, readFile, stat } = require('node:fs/promises');
const path = require('node:path');

async function copyMnnRuntime(projectRoot, platformProjectRoot) {
  const manifest = JSON.parse(
    await readFile(path.join(projectRoot, 'vendor', 'mnn', 'mnn-android.manifest.json'), 'utf8'),
  );
  const jniRoot = path.join(platformProjectRoot, 'app', 'src', 'main', 'jniLibs');

  for (const abi of manifest.abis) {
    const destinationDirectory = path.join(jniRoot, abi);
    await mkdir(destinationDirectory, { recursive: true });

    for (const library of manifest.libraries) {
      const source = path.join(projectRoot, 'vendor', 'mnn', 'android', abi, library);
      let sourceStat;
      try {
        sourceStat = await stat(source);
      } catch (error) {
        if (error?.code === 'ENOENT') {
          throw new Error(
            `MNN Android library is missing: ${source}\n` +
              'Run "pnpm mnn:android:build" before Android prebuild.',
          );
        }
        throw error;
      }

      const expected = manifest.artifacts[abi][library];
      if (sourceStat.size !== expected.size) {
        throw new Error(
          `MNN Android library has an unexpected size: ${abi}/${library} ` +
            `(${sourceStat.size}/${expected.size})`,
        );
      }
      const digest = createHash('sha256').update(await readFile(source)).digest('hex');
      if (digest !== expected.sha256) {
        throw new Error(`MNN Android library checksum mismatch: ${abi}/${library}`);
      }
      await copyFile(source, path.join(destinationDirectory, library));
    }
  }

}

function withMnnRuntime(config) {
  config = withGradleProperties(config, (gradleConfig) => {
    gradleConfig.modResults = gradleConfig.modResults.filter(
      (entry) => entry.type !== 'property' || entry.key !== 'reactNativeArchitectures',
    );
    gradleConfig.modResults.push({
      type: 'property',
      key: 'reactNativeArchitectures',
      value: 'arm64-v8a,x86_64',
    });
    return gradleConfig;
  });

  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      await copyMnnRuntime(
        modConfig.modRequest.projectRoot,
        modConfig.modRequest.platformProjectRoot,
      );
      return modConfig;
    },
  ]);
}

module.exports = withMnnRuntime;
module.exports.copyMnnRuntime = copyMnnRuntime;
