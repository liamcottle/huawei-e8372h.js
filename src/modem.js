const { XMLParser, XMLBuilder } = require('fast-xml-parser');
const axios = require('axios');
const Password = require('./password');
const SMS = require('./api/sms');

class Modem {

    constructor(ip, username, password, session, token) {

        this.ip = ip;
        this.username = username;
        this.password = password;
        this.session = session;
        this.token = token;
        this.client = this._createAxiosClient();

        this.onSaveAuthCallback = null;

        // init api wrappers
        this.api = {
            sms: new SMS(this),
        };

    }

    _createAxiosClient() {

        // create axios client
        const client = axios.create({
            baseURL: `http://${this.ip}`,
        });

        // intercept all responses
        client.interceptors.response.use(async (response) => {

            // update session
            if(response.headers['set-cookie']){
                this.session = response.headers['set-cookie'];
            }

            // update token (returned after login)
            if(response.headers['__requestverificationtokenone']){
                this.token = response.headers['__requestverificationtokenone'];
            }

            // update token (returned after other requests)
            if(response.headers['__requestverificationtoken']){
                this.token = response.headers['__requestverificationtoken'];
            }

            // fire auth save callback
            await this._onSaveAuth();

            return response;

        });

        return client;

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
        const xml = await this.getXml('/api/webserver/SesTokInfo');
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

    async getXml(url) {

        // send get request
        const response = await this.client.get(url, {
            headers: this.buildRequestHeaders(),
        });

        // parse response xml
        return new XMLParser().parse(response.data);

    }

    async postXml(url, data) {

        // build request xml
        const xml = new XMLBuilder({}).build(data);

        // send post request
        const requestData = "<?xml version='1.0' encoding='UTF-8'?>" + xml;
        const response = await this.client.post(url, requestData, {
            headers: this.buildRequestHeaders(),
        });

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
        const data = await this.postXml('/api/user/login', {
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
        return this.getXml('/api/user/state-login');
    }

    async isLoggedIn() {
        try {
            const loginState = await this.getLoginState();
            return loginState.response?.State === 0;
        } catch(_) {}
        return false;
    }

}

module.exports = Modem;
