import fs from 'node:fs';
import path from 'node:path';

/**
 * Where the databases live: <userData>/db. The old app kept them in ./db, relative to the working
 * directory, which a packaged app cannot rely on: its files are inside the ASAR and the working
 * directory depends on how it was started.
 * @param userData app.getPath('userData')
 */
export const databaseDirectory = (userData) => path.join(userData, 'db');

/**
 * Copies the database <name>.db from where the old app kept it, unless the new one already exists.
 * The original stays where it is. A failure is logged and the app starts with the new location as it is.
 * @param name The file name without extension
 * @param dir The new directory, see databaseDirectory
 * @param legacyDir The old directory, ./db relative to the working directory
 * @returns {boolean} Whether the database was copied
 */
export const migrateLegacyDatabase = (name, dir, legacyDir = path.resolve('db')) => {
    const from = path.resolve(legacyDir, `${name}.db`);
    const to = path.resolve(dir, `${name}.db`);
    if (from === to || fs.existsSync(to) || !fs.existsSync(from)) return false;

    // Copy next to the target and rename, so that an interrupted copy never looks like a migrated database
    const partial = `${to}.migrating`;
    try {
        fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(from, partial);
        fs.renameSync(partial, to);
    } catch (e) {
        console.error(`Could not migrate the database ${from} to ${to}`, e);
        return false;
    }

    console.log(`Migrated the database ${from} to ${to}; the original is kept`);
    return true;
};
