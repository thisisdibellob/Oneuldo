import { Directory, File, Paths } from 'expo-file-system';
import { createFileMarketLayoutStorage } from './marketLayoutStorage.file';

const DIRECTORY_NAME = 'oneuldo-market-layout-library-v1';
const MAX_FILE_BYTES = 4_800_000;
function directory() { return new Directory(Paths.document, DIRECTORY_NAME); }

export const marketLayoutStorage = createFileMarketLayoutStorage({
  async list() {
    // File.exists can return false for an unreadable file. Listing the parent instead
    // distinguishes a missing store from access errors and never silently resets it.
    if (!Paths.document.list().some(entry => entry.name === DIRECTORY_NAME)) return [];
    return directory().list().map(entry => entry.name);
  },
  async read(name) {
    const file = new File(directory(), name);
    if (file.size > MAX_FILE_BYTES) throw new Error('Saved layout library is too large');
    return file.text();
  },
  async write(name, contents) {
    const parent = directory();
    parent.create({ intermediates: true, idempotent: true });
    const file = new File(parent, name);
    file.create();
    file.write(contents);
  },
  async move(from, to) { await new File(directory(), from).move(new File(directory(), to)); },
  async remove(name) { new File(directory(), name).delete(); },
});
