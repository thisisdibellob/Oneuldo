const { withDangerousMod, withGradleProperties } = require('expo/config-plugins');
const { createHash } = require('node:crypto');
const { copyFile, mkdir, readFile, stat } = require('node:fs/promises');
const path = require('node:path');

async function copyLlamaRuntime(projectRoot, platformProjectRoot) {
  const vendorRoot = path.join(projectRoot, 'vendor', 'llama');
  const manifest = JSON.parse(
    await readFile(path.join(vendorRoot, 'llama-android.manifest.json'), 'utf8'),
  );
  const jniRoot = path.join(platformProjectRoot, 'app', 'src', 'main', 'jniLibs');

  for (const abi of manifest.abis) {
    const source = path.join(vendorRoot, 'android', abi, manifest.library);
    const destinationDirectory = path.join(jniRoot, abi);
    await mkdir(destinationDirectory, { recursive: true });

    let sourceStat;
    try {
      sourceStat = await stat(source);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw new Error(`llama.cpp Android library is missing: ${source}\nRun "pnpm llama:android:build" first.`);
      }
      throw error;
    }

    const expected = manifest.artifacts[abi];
    if (sourceStat.size !== expected.size) {
      throw new Error(`llama.cpp library size mismatch: ${abi}`);
    }
    const digest = createHash('sha256').update(await readFile(source)).digest('hex');
    if (digest !== expected.sha256) {
      throw new Error(`llama.cpp library checksum mismatch: ${abi}`);
    }
    await copyFile(source, path.join(destinationDirectory, manifest.library));
  }
}

function withLlamaRuntime(config) {
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
      await copyLlamaRuntime(modConfig.modRequest.projectRoot, modConfig.modRequest.platformProjectRoot);
      return modConfig;
    },
  ]);
}

module.exports = withLlamaRuntime;
module.exports.copyLlamaRuntime = copyLlamaRuntime;
