const crypto = require('crypto');

class Password {

    /**
     * Implementation of password_type=4 for Huawei E8372H
     * base64(sha256Hex(username + base64(sha265Hex(password)) + token))
     * @param username
     * @param password
     * @param token
     * @returns string
     */
    static v4(username, password, token) {

        // sha256 password to hex, then base64 encode the hex
        let hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
        hashedPassword = Buffer.from(hashedPassword).toString('base64');

        // sha256 the auth string to hex, then base64 encode the hex
        let authCredential = username + hashedPassword + token;
        authCredential = crypto.createHash('sha256').update(authCredential).digest('hex');
        authCredential = Buffer.from(authCredential).toString('base64');

        return authCredential;

    }

}

module.exports = Password;
