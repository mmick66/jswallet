import crypto from 'crypto';

class Hasher {

    static hash(password) {

        return new Promise((resolve, reject) => {

            if (!password) reject(new Error('No value provided'));

            crypto.pbkdf2(password, Hasher.Salt, 2048, 48, Hasher.Algorithm, (err, data) => {
                if (err) reject(err);

                const hex = data.toString('hex');
                resolve(hex);

            });
        });
    }
}

Hasher.Salt = 'jswallet';
Hasher.Algorithm = 'sha512';
export default Hasher;
