import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendDirectory = resolve(scriptDirectory, '..');
const manifestPath = join(
  frontendDirectory,
  'models',
  'qwen3.5-0.8b-mnn.manifest.json',
);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const targetDirectory = join(frontendDirectory, manifest.targetDirectory);
const verifyOnly = process.argv.includes('--verify');

function sourceUrl(fileName) {
  const encodedName = fileName
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');

  return `https://huggingface.co/${manifest.modelId}/resolve/${manifest.revision}/${encodedName}`;
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }

  return hash.digest('hex');
}

async function inspectFile(file) {
  const filePath = join(targetDirectory, file.name);

  try {
    const fileStat = await stat(filePath);
    if (fileStat.size !== file.size) {
      return { valid: false, reason: `size ${fileStat.size}/${file.size}` };
    }

    if (file.sha256) {
      const actualHash = await sha256(filePath);
      if (actualHash !== file.sha256) {
        return { valid: false, reason: `sha256 ${actualHash}` };
      }
    }

    return { valid: true };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { valid: false, reason: 'missing' };
    }
    throw error;
  }
}

async function download(file) {
  const destination = join(targetDirectory, file.name);
  const partialDestination = `${destination}.part`;
  await mkdir(dirname(destination), { recursive: true });
  await rm(partialDestination, { force: true });

  const response = await fetch(sourceUrl(file.name), { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(
      `${file.name} download failed: ${response.status} ${response.statusText}`,
    );
  }

  console.log(`Downloading ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
  await pipeline(
    Readable.fromWeb(response.body),
    createWriteStream(partialDestination),
  );
  await rename(partialDestination, destination);
}

await mkdir(targetDirectory, { recursive: true });

let failed = false;
for (const file of manifest.files) {
  let inspection = await inspectFile(file);

  if (!inspection.valid && !verifyOnly) {
    console.log(`${file.name}: ${inspection.reason}; downloading`);
    await download(file);
    inspection = await inspectFile(file);
  }

  if (inspection.valid) {
    console.log(`${file.name}: OK`);
  } else {
    failed = true;
    console.error(`${file.name}: INVALID (${inspection.reason})`);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`Qwen model is ready at ${targetDirectory}`);
}
