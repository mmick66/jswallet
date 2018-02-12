class Key {

    constructor(wif, encrypted = false, password = null) {
        this.__wif = wif;
        this.__encrypted = encrypted;
        this.__password = password;
    }

    get wif() {
        return this.__wif;
    }

    get encrypted() {
        return this.__encrypted;
    }

    matchesPassword(password) {
        return this.__password === password;
    }

}

export default Key;
