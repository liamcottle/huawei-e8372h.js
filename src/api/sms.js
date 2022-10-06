const moment = require('moment');

class SMS {

    static BOXTYPE_LOCAL_INBOX = 1;
    static BOXTYPE_LOCAL_SENT = 2;
    static BOXTYPE_LOCAL_DRAFT = 3;
    static BOXTYPE_LOCAL_TRASH = 4;
    static BOXTYPE_SIM_INBOX = 5;
    static BOXTYPE_SIM_SENT = 6;
    static BOXTYPE_SIM_DRAFT = 7;
    static BOXTYPE_MIX_INBOX = 8;
    static BOXTYPE_MIX_SENT = 9;
    static BOXTYPE_MIX_DRAFT = 10;
    static BOXTYPE_INBOX = SMS.BOXTYPE_LOCAL_INBOX;
    static BOXTYPE_SENT = SMS.BOXTYPE_LOCAL_SENT;
    static BOXTYPE_DRAFT = SMS.BOXTYPE_LOCAL_DRAFT;

    static SMS_STATE_UNREAD = 0;
    static SMS_STATE_READ = 1;
    static SMS_STATE_DRAFT = 2;
    static SMS_STATE_SENT = 3;

    constructor(modem) {
        this.modem = modem;
    }

    /**
     * Fetch a paginated list of sms from the specified box type
     * @param boxType which box to list sms from (inbox/outbox)
     * @param readCount how many sms to fetch per page
     * @param pageIndex which page to load
     * @returns {Promise<*[]>}
     */
    async list(boxType = SMS.BOXTYPE_INBOX, readCount = 20, pageIndex = 1) {

        const messages = [];

        // fetch messages
        const data = await this.modem.postXml('/api/sms/sms-list', {
            'request': {
                'PageIndex': pageIndex,
                'ReadCount': readCount,
                'BoxType': boxType,
                'SortType': 0,
                'Ascending': 0,
                'UnreadPreferred': 1, // was 0, changed to 1 to test?
            },
        });

        // attempt to get message(s)
        const count = data.response.Count;
        let modemMessages = data.response.Messages.Message;

        // when only 1 message exists, xml returns it as a single object, instead of array
        if(count === 1){
            modemMessages = [
                modemMessages,
            ];
        }

        // parse messages
        for(const index in modemMessages){
            const modemMessage = modemMessages[index];
            messages.push({
                index: modemMessage.Index,
                state: modemMessage.Smstat,
                from: `${modemMessage.Phone}`, // cast to string
                content: `${modemMessage.Content}`, // cast to string
                is_unread: modemMessage.Smstat === SMS.SMS_STATE_UNREAD,
                created_at: modemMessage.Date,
            });
        }

        return messages;

    }

    /**
     * Send an SMS
     * @param to a string or an array of E.123 international formatted phone numbers, excluding spaces
     * @param content the message to send
     * @returns {Promise<boolean>}
     */
    async send(to, content) {

        // send sms
        const data = await this.modem.postXml('/api/sms/send-sms', {
            'request': {
                'Index': '-1',
                'Phones': {
                    'Phone': to,
                },
                'Sca': '',
                'Content': content,
                'Length': content.length,
                'Reserved': '1',
                'Date': moment().format('YYYY-MM-DD hh:mm:ss'), // 2022-10-06 18:48:25
            },
        });

        return data.Response === 'OK';

    }

    /**
     * Mark an SMS as read
     * @param index the sms index returned from a `list` request
     * @returns {Promise<boolean>}
     */
    async markAsRead(index) {

        // mark sms as read
        const data = await this.modem.postXml('/api/sms/set-read', {
            'request': {
                'Index': index,
            },
        });

        return data.Response === 'OK';

    }

    /**
     * Delete an SMS from the modem
     * @param index the sms index returned from a `list` request
     * @returns {Promise<boolean>}
     */
    async delete(index) {

        // delete sms
        const data = await this.modem.postXml('/api/sms/delete-sms', {
            'request': {
                'Index': index,
            },
        });

        return data.Response === 'OK';

    }

}

module.exports = SMS;
