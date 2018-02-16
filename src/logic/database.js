import Datastore from 'nedb';
import Wallet from './wallet.class';


class Database {

    constructor(name) {
        this.db = new Datastore({ filename: `./db/${name}.db`, autoload: true });
    }

    find(q) {
        return new Promise((res, rej) => {
            this.db.find(q || {}, (err, docs) => {
                if (err) rej(err);
                res(docs);
            });
        });
    }

    insert(obj) {
        return new Promise((res, rej) => {
            this.db.insert(obj, (err) => {
                if (err) rej(err);
                res();
            });
        });
    }

    remove(q) {
        return new Promise((res, rej) => {
            this.db.remove(q, (err) => {
                if (err) rej(err);
                res();
            });
        });
    }

}

export default Database;
