const crypto = require('crypto');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');
const superagent = require('superagent');

class Modem {

    constructor(ip, username, password, session, token) {
        this.ip = ip;
        this.username = username;
        this.password = password;
        this.session = session;
        this.token = token;
        this.onSaveAuthCallback = null;
    }

    onSaveAuth(callback) {
        this.onSaveAuthCallback = callback;
    }

    async loadAuth(data) {
        const auth = JSON.parse(data);
        if(auth){
            this.ip = auth.ip;
            this.username = auth.username;
            this.password = auth.password;
            this.session = auth.session;
            this.token = auth.token;
        }
    }

    async _onSaveAuth() {
        if(this.onSaveAuthCallback){
            await this.onSaveAuthCallback(JSON.stringify({
                ip: this.ip,
                username: this.username,
                password: this.password,
                session: this.session,
                token: this.token,
            }, null, 4));
        }
    }

    async init() {
        const session = await this.getSession();
        this.session = session.SesInfo;
        this.token = session.TokInfo;
    }

    async getSession() {
        try {
            var url = `http://${this.ip}/html/home.html`
            var res = await superagent.get(url)
                .timeout({
                    response: 5000,  // Wait 5 seconds for the server to start sending,
                    deadline: 10000, // but allow 10 seconds for the file to finish loading.
                })
                .retry(2);
            let SesInfo = res.header['set-cookie'][0].split(';')[0];
            let TokInfo = res.text.match(/<meta name="csrf_token" content="(.*?)"\/>/)[1];
            return { SesInfo, TokInfo };
        } catch (e) {
            console.log(e)
            return null;
        }
    }

    async encodePassword(username, password, token) {

        // sha256 password to hex, then base64 encode the hex
        let hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
        hashedPassword = Buffer.from(hashedPassword).toString('base64');

        // sha256 the auth string to hex, then base64 encode the hex
        let authCredential = username + hashedPassword + token;
        authCredential = crypto.createHash('sha256').update(authCredential).digest('hex');
        authCredential = Buffer.from(authCredential).toString('base64');

        return authCredential;

    }

    async get(url) {

        // send post request
        var res = await superagent.get(url)
            .set({
                '__RequestVerificationToken': this.token,
                'Cookie': this.session,
                'Connection': 'keep-alive',
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                'Accept-Encoding': 'gzip, deflate',
                'Pragma': 'no-cache',
                'Accept-Language': 'en-us'
            });

        // update session
        if(res.res.headers['set-cookie']) {
            this.session = res.res.headers['set-cookie'][0];
        }

        // fire auth save callback
        await this._onSaveAuth();

        // return result
        return res;

    }

    async post(url, data) {

        // send post request
        var res = await superagent.post(url)
            .set({
                '__RequestVerificationToken': this.token,
                'Cookie': this.session,
                'Connection': 'keep-alive',
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                'Accept-Encoding': 'gzip, deflate',
                'Pragma': 'no-cache',
                'Accept-Language': 'en-us'
            })
            .send(data);

        // update session
        if(res.res.headers['set-cookie']){
            this.session = res.res.headers['set-cookie'][0];
        }

        // update token (after login)
        if(res.res.headers['__requestverificationtokenone']){
            this.token = res.res.headers['__requestverificationtokenone'];
        }

        // update token (other requests)
        if(res.res.headers['__requestverificationtoken']){
            this.token = res.res.headers['__requestverificationtoken'];
        }

        // fire auth save callback
        await this._onSaveAuth();

        // return result
        return res;

    }

    async getXml(url) {

        // send get request
        const response = await this.get(url);

        // parse response xml
        return new XMLParser().parse(response.res.text);

    }

    async postXml(url, data) {

        // build request xml
        const xml = new XMLBuilder().build(data);

        // send post request
        const response = await this.post(url, "<?xml version='1.0' encoding='UTF-8'?>" + xml);

        // parse response xml
        return new XMLParser().parse(response.res.text);

    }

    async login() {

        // init session
        await this.init();

        // encode password
        const encodedPassword = await this.encodePassword(this.username, this.password, this.token);

        try {

            var url = `http://${this.ip}/api/user/login`
            const requestXml = `<?xml version "1.0" encoding="UTF-8"?><request><Username>${this.username}</Username><Password>${encodedPassword}</Password><password_type>4</password_type></request>`;
            var res = await this.post(url, requestXml);

            // parse error code
            // 108007 = login rate limit

            return true;

        } catch (e) {
            console.error(e);
            return false;
        }

    }

    async getLoginState() {
        return this.getXml(`http://${this.ip}/api/user/state-login`);
    }

    async isLoggedIn() {
        try {
            const loginState = await this.getLoginState();
            return loginState.response?.State === 0;
        } catch(_) {}
        return false;
    }

    async getMessages() {
        try {

            // fetch messages
            const data = await this.postXml(`http://${this.ip}/api/sms/sms-list`, {
                'request': {
                    'PageIndex': 1,
                    'ReadCount': 20,
                    'BoxType': 1, // inbox
                    'SortType': 0,
                    'Ascending': 0,
                    'UnreadPreferred': 1, // was 0, changed to 1 to test?
                },
            });

            // attempt to get message(s)
            const results = [];
            const count = data.response.Count;
            let messages = data.response.Messages.Message;

            // when only 1 message exists, xml shows it as a single object, instead of array
            if(count === 1){
                messages = [
                    messages,
                ];
            }

            // parse messages
            for(const index in messages){
                const message = messages[index];
                results.push({
                    index: message.Index,
                    from: `${message.Phone}`, // cast to string
                    content: `${message.Content}`, // cast to string
                    is_unread: message.Smstat === 0, // Smstat=0 unread, Smstat=1 read
                });
            }

            return results;

        } catch (e) {
            console.log(e)
            return [];
        }
    }

    async setMessageRead(index) {
        try {

            // fetch messages
            const data = await this.postXml(`http://${this.ip}/api/sms/set-read`, {
                'request': {
                    'Index': index,
                },
            });

            return data.Response === 'OK';

        } catch (e) {
            console.log(e)
            return false;
        }
    }

    async deleteMessage(index) {
        try {

            // fetch messages
            const data = await this.postXml(`http://${this.ip}/api/sms/delete-sms`, {
                'request': {
                    'Index': index,
                },
            });

            return data.Response === 'OK';

        } catch (e) {
            console.log(e)
            return false;
        }
    }

}

module.exports = Modem;
