const { XMLParser, XMLBuilder } = require('fast-xml-parser');
const axios = require('axios');
const Password = require('./password');

class Modem {

    constructor(ip, username, password, session, token) {
        this.ip = ip;
        this.username = username;
        this.password = password;
        this.session = session;
        this.token = token;
        this.onSaveAuthCallback = null;
    }

    buildRequestHeaders() {

        // default headers for all requests
        let headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
            'Pragma': 'no-cache',
            'Accept-Language': 'en-us',
        };

        // add token if available
        if(this.token != null){
            headers['__RequestVerificationToken'] = this.token;
        }

        // add session cookie if available
        if(this.session != null){
            headers['Cookie'] = this.session;
        }

        return headers;

    }

    async initSession() {
        const xml = await this.getXml(`http://${this.ip}/api/webserver/SesTokInfo`);
        this.session = xml.response.SesInfo;
        this.token = xml.response.TokInfo;
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

    async get(url) {

        // send post request
        const response = await axios.get(url, {
            headers: this.buildRequestHeaders(),
        });

        // update session
        if(response.headers['set-cookie']) {
            this.session = response.headers['set-cookie'];
        }

        // fire auth save callback
        await this._onSaveAuth();

        // return result
        return response;

    }

    async post(url, data) {

        // send post request
        const response = await axios.post(url, data, {
            headers: this.buildRequestHeaders(),
        });

        // update session
        if(response.headers['set-cookie']){
            this.session = response.headers['set-cookie'];
        }

        // update token (after login)
        if(response.headers['__requestverificationtokenone']){
            this.token = response.headers['__requestverificationtokenone'];
        }

        // update token (other requests)
        if(response.headers['__requestverificationtoken']){
            this.token = response.headers['__requestverificationtoken'];
        }

        // fire auth save callback
        await this._onSaveAuth();

        // return result
        return response;

    }

    async getXml(url) {

        // send get request
        const response = await this.get(url);

        // parse response xml
        return new XMLParser().parse(response.data);

    }

    async postXml(url, data) {

        // build request xml
        const xml = new XMLBuilder({}).build(data);

        // send post request
        const response = await this.post(url, "<?xml version='1.0' encoding='UTF-8'?>" + xml);

        // parse response xml
        return new XMLParser().parse(response.data);

    }

    async login() {

        // init session
        await this.initSession();

        // determine required password type
        const loginState = await this.getLoginState();
        const passwordType = loginState.response?.password_type;
        if(passwordType !== 4){
            throw `Modem requested unsupported password_type: ${passwordType}`;
        }

        // send login request
        const data = await this.postXml(`http://${this.ip}/api/user/login`, {
            'request': {
                'Username': this.username,
                'Password': Password.v4(this.username, this.password, this.token),
                'password_type': '4',
            },
        });

        // todo handle specific error codes and return friendly messages

        // reject if login failed
        if(data.response !== 'OK'){
            throw 'Failed to log in!';
        }

        return data;

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
