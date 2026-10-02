import path from 'path';
import Datastore from '@seald-io/nedb';


class Database {

    /**
     * @param name The file name without extension
     * @param dir The directory holding the file, relative to the working directory
     */
    constructor(name, dir = './db') {
        this.db = new Datastore({ filename: path.join(dir, `${name}.db`), autoload: true });
    }

    find(q) {
        return this.db.findAsync(q || {});
    }

    insert(obj) {
        return this.db.insertAsync(obj);
    }

    remove(q) {
        return this.db.removeAsync(q);
    }

    /**
     * @param q Query selecting the document to update; only the first match is updated
     * @param update A replacement document or a set of modifiers such as $set
     * @returns {Promise<number>} The number of documents updated
     */
    update(q, update) {
        return this.db.updateAsync(q, update).then(({ numAffected }) => numAffected);
    }

}

export default Database;
