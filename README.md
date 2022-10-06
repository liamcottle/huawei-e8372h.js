# Huawei E8372H

This is a NodeJS library for interacting with the [Huawei E8372H](https://consumer.huawei.com/en/routers/e8372/) LTE USB modem.

## Install

To use this library in your own NodeJS app, you can install it via npm.

```shell
npm install @liamcottle/huawei-e8372h.js
```

## Example

```js
const Modem = require('@liamcottle/huawei-e8372h.js');
const modem = new Modem('192.168.8.1', 'admin', 'admin');

// log in to modem before using any features
modem.login().then(async () => {

    // list sms messages
    const messages = await modem.api.sms.list();
    console.log(messages);

    // send an sms
    // await modem.api.sms.send('+64210000000', 'message content');
    
    // logout of modem
    await modem.logout();
    
});
```

## Supported Features

- [x] Listing SMS from Inbox/Outbox.
- [x] Sending SMS to multiple phone numbers.
- [x] Marking SMS on the modem as read.
- [x] Deleting SMS from the modem.

```js
modem.api.sms.list();
modem.api.sms.send();
modem.api.sms.markAsRead();
modem.api.sms.delete();
```


## Password Types

- `password_type=3`: password is base64 encoded.
- `password_type=4`: username, password and token are base64 and hex encoded.

## References

- https://github.com/arska/e3372/issues/1
- https://github.com/evert-arias/huawei-e8372h
- https://github.com/avinh/Huawei-E8372h-toggle-on-off/blob/master/app.js
- https://github.com/manoaratefy/huawei-e8372-api
