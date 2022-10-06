const Modem = require('./src/modem');

!async function main() {

    // default modem credentials
    const ip = '192.168.8.1';
    const username = 'admin';
    const password = 'admin';

    // create modem instance
    const modem = new Modem(ip, username, password);

    // log in
    console.log("Logging in...");
    await modem.login();

    // fetch messages
    console.log("Fetching messages...");
    const messages = await modem.api.sms.list();
    console.log(messages);

    // log out
    console.log("Logging out...");
    await modem.logout();

}();