const { withDangerousMod } = require('expo/config-plugins');
const { createHash } = require('node:crypto');
const {
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
} = require('node:fs/promises');
const path = require('node:path');

const MODEL_DIRECTORY_NAME = 'qwen3.5-0.8b-mnn';
const MANIFEST_FILE_NAME = `${MODEL_DIRECTORY_NAME}.manifest.json`;

async function copyQwenModelAssets(projectRoot, platformProjectRoot) {
  const modelsDirectory = path.join(projectRoot, 'models');
  const sourceDirectory = path.join(modelsDirectory, MODEL_DIRECTORY_NAME);
  const manifestPath = path.join(modelsDirectory, MANIFEST_FILE_NAME);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const destinationDirectory = path.join(
    platformProjectRoot,
    'app',
    'src',
    'main',
    'assets',
    'models',
    MODEL_DIRECTORY_NAME,
  );

  const files = [];
  for (const file of manifest.files) {
    const sourcePath = path.join(sourceDirectory, file.name);
    let sourceStat;

    try {
      sourceStat = await stat(sourcePath);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw new Error(
          `Qwen model file is missing: ${sourcePath}\n` +
            'Run "pnpm model:qwen:download" before Android prebuild.',
        );
      }
      throw error;
    }

    if (sourceStat.size !== file.size) {
      throw new Error(
        `Qwen model file has an unexpected size: ${file.name} ` +
          `(${sourceStat.size}/${file.size})`,
      );
    }

    const digest = createHash('sha256').update(await readFile(sourcePath)).digest('hex');
    if (digest !== file.sha256) {
      throw new Error(`Qwen model file checksum mismatch: ${file.name}`);
    }

    files.push({ sourcePath, destinationPath: path.join(destinationDirectory, file.name) });
  }

  await rm(destinationDirectory, { recursive: true, force: true });
  await mkdir(destinationDirectory, { recursive: true });

  for (const file of files) {
    await copyFile(file.sourcePath, file.destinationPath);
  }
  await copyFile(manifestPath, path.join(destinationDirectory, 'model-manifest.json'));

  console.log(
    `[with-qwen-model] Copied ${files.length} files to ${destinationDirectory}`,
  );
}

function withQwenModel(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      await copyQwenModelAssets(
        modConfig.modRequest.projectRoot,
        modConfig.modRequest.platformProjectRoot,
      );
      return modConfig;
    },
  ]);
}

module.exports = withQwenModel;
module.exports.copyQwenModelAssets = copyQwenModelAssets;
