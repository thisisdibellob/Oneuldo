const { withDangerousMod } = require('expo/config-plugins');
const { copyFile, mkdir, readFile, rm } = require('node:fs/promises');
const path = require('node:path');

const MODEL_DIRECTORY_NAME = 'bllossom-3b-q4-k-m';
const MANIFEST_FILE_NAME = `${MODEL_DIRECTORY_NAME}.manifest.json`;

async function copyBllossomManifest(projectRoot, platformProjectRoot) {
  const manifestPath = path.join(projectRoot, 'models', MANIFEST_FILE_NAME);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.targetDirectory !== `models/${MODEL_DIRECTORY_NAME}`) {
    throw new Error('Bllossom model manifest targetDirectory is invalid.');
  }

  const destinationDirectory = path.join(
    platformProjectRoot,
    'app',
    'src',
    'main',
    'assets',
    'models',
    MODEL_DIRECTORY_NAME,
  );

  // APK에는 2GB 모델 대신 다운로드 정보가 담긴 작은 manifest만 넣는다.
  await rm(destinationDirectory, { recursive: true, force: true });
  await mkdir(destinationDirectory, { recursive: true });
  await copyFile(manifestPath, path.join(destinationDirectory, 'model-manifest.json'));
}

function withBllossomModel(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      await copyBllossomManifest(
        modConfig.modRequest.projectRoot,
        modConfig.modRequest.platformProjectRoot,
      );
      return modConfig;
    },
  ]);
}

module.exports = withBllossomModel;
module.exports.copyBllossomManifest = copyBllossomManifest;
