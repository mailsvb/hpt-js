const { connect } = require('node:tls');
const EventEmitter = require('node:events');
const SAUCE_REQUIRED = 2;
const { SAUCE_VERSION,
        DEFS,
        REG_EX,
        LAMPMODE,
        LAMPCOLOUR,
        CALLEVT,
        CODECS,
        TONES,
        GET_AUTH_REQUEST_MSG,
        GET_TI_MSG_CONTENT,
        GET_OCMS_MSG_CONTENT,
        SET_OCMS_DATA_MSG,
        GET_OCMS_DATA_MSG } = require(`./sauce_v${SAUCE_REQUIRED}.js`)

const NUMPAD = {
    0: 0,
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
    6: 6,
    7: 7,
    8: 8,
    9: 9,
    '*': 10,
    '#': 11,
}

const CHAR = {
    '61': '2',
    '62': '22',
    '63': '222',
    '64': '3',
    '65': '33',
    '66': '333',
    '67': '4',
    '68': '44',
    '69': '444',
    '6a': '5',
    '6b': '55',
    '6c': '555',
    '6d': '6',
    '6e': '66',
    '6f': '666',
    '70': '7',
    '71': '77',
    '72': '777',
    '73': '7777',
    '74': '8',
    '75': '88',
    '76': '888',
    '77': '9',
    '78': '99',
    '79': '999',
    '7a': '9999'
}

const CHAR_SPECIAL = {
    '20': '11',
    '3b': '111',
    '3d': '1111',
    '24': '11111',
    '5c': '111111',
    '26': '1111111',
    '5b': '11111111',
    '5d': '111111111',
    '7b': '1111111111',
    '7d': '11111111111',
    '25': '111111111111',
    '2e': '*',
    '2a': '**',
    '23': '***',
    '2c': '****',
    '3f': '*****',
    '21': '******',
    '27': '*******',
    '22': '********',
    '2b': '*********',
    '2d': '**********',
    '28': '***********',
    '29': '************',
    '40': '*************',
    '2f': '**************',
    '3a': '***************',
    '5f': '****************',
}

const DEVICE_TYPE = {
    NONE:   0,
    CP100:  10,
    CP110:  11,
    CP200:  20,
    CP205:  21,
    CP210:  22,
    CP400:  30,
    CP410:  31,
    CP600:  40,
    CP700:  50,
    CP710:  51,
}

const KEY_EVENTS = {
    0: 'EVT_KEY_RELEASED',
    1: 'EVT_KEY_PRESSED',
    4: 'EVT_KEY_LONGPUSH'
}

const TONE_STATE = {
    0: 'OFF',
    1: 'ON',
}

const KEYS = {
    EVT_HOOK_OFF: 0,
    EVT_HOOK_ON: 1,

    EVT_KEY_RELEASED: 0,
    EVT_KEY_PRESSED: 1,
    EVT_KEY_PUSHED: 2,
    EVT_KEY_LONGPUSH: 4,

    KEY_0: 0,
    KEY_1: 1,
    KEY_2: 2,
    KEY_3: 3,
    KEY_4: 4,
    KEY_5: 5,
    KEY_6: 6,
    KEY_7: 7,
    KEY_8: 8,
    KEY_9: 9,
    KEY_AST: 10,
    KEY_HASH: 11,

    KEY_MESSAGES: 23,
    KEY_MENU: 24,

    KEY_PRESENCE: 26,
    KEY_FORWARD: 31,
    KEY_FEATURE: 32,
    KEY_LOUDSPEAKER: 33,
    KEY_HEADSET: 34,
    KEY_MUTE: 35,
    KEY_MINUS: 36,
    KEY_PLUS: 37,
    KEY_HOLD: 39,

    KEY_NAVI_UP: 40,
    KEY_NAVI_DOWN: 41,
    KEY_NAVI_LEFT: 42,
    KEY_NAVI_RIGHT: 43,
    KEY_NAVI_OK: 44,

    KEY_HOOKSWITCH: 45,

    KEY_SOFT_1: 48,
    KEY_SOFT_2: 49,
    KEY_SOFT_3: 50,
    KEY_SOFT_4: 51,
    KEY_SOFT_5: 52,
    KEY_SOFT_6: 53,

    LED_ALERT: 65,
    SOCKET_HEADSET: 67,
    COMBO_RESTART: 71,
    COMBO_RESET: 73,
    COMBO_ADMIN: 74,
}

const speechTestLength = 5000;

if (SAUCE_VERSION != SAUCE_REQUIRED) {
    console.error(`SAUCE version mismatch required=${SAUCE_REQUIRED} sauce=${SAUCE_VERSION}`)
    process.exit()
}

/**
 * Device class.
 * @extends EventEmitter
 */
class Device extends EventEmitter {
    /** @property {string} - The IP address provided. */
    #ip;
    /** @property {string} - The admin password provided. */
    #pw;
    /** @property {object} - The TLS connection instance. */
    #client;
    /** @property {object} - The TLS connection options object. */
    #clientOptions;
    /** @property {string} - The local address used to connect to the device. */
    #localAddress;
    /** @property {string} - The local port used to connect to the device. */
    #localPort;
    /** @property {boolean} - The connected state of the Device instance. */
    #connected;
    /** @property {boolean} - The dongle state of the Device instance for advanced operation. */
    #fullAccess;
    /** @property {boolean} - The subscription state of the Device instance for receiving events. */
    #subscribed;
    /** @property {number} - The request ID sent in the XML messages to the device. */
    #reqId;
    /** @property {object} - The object containing the promises per request ID to be resolved. */
    #resolver;

    /** @property {string} - The main E164 number of the device connected. */
    #e164;
    /** @property {string} - The software version of the connected device. */
    #softwareVersion;
    /** @property {string} - The last toast notification displayed on the device. */
    #lastToastNotification;
    /** @property {string} - The last popup notification displayed on the device. */
    #lastPopupNotification;
    /** @property {string} - The splitted key module data received as string. */
    #kmStringSplitted;
    /** @property {string} - The complete key module data received as string. */
    #kmStringComplete;
    /** @property {object} - The parsed key module data as object. */
    #kmDisplay;
    /** @property {string} - The splitted display data received as string. */
    #displayStringSplitted;
    /** @property {string} - The complete display data received as string. */
    #displayStringComplete;
    /** @property {object} - The parsed display data as object. */
    #display;
    /** @property {string} - The input mode of the device. */
    #inputMode;
    /** @property {string} - The default colour of the device. */
    #defaultColour
    /** @property {number} - The type of the connected device. */
    #deviceType
    /** @property {string} - The type of the connected device as string. */
    #deviceTypeString
    /** @property {string} - The complete remote call info of the connected device. */
    #remoteCallInfo
    /** @property {string} - The remote name/number of the connected device. */
    #remoteNameNumber
    /** @property {string} - The current selected item on the device. */
    #selectedItem

    /** @property {object} - The tone states object. */
    #toneState
    /** @property {object} - The lamp states object. */
    #lampState
    /** @property {object} - The call states object. */
    #callState
    /** @property {object} - The speech path test result object. */
    #speechPathTestResult

    /**
     * Create a new instance of Device
     * @param {string} ip - The IP address of the device.
     * @param {string} pw - The admin password of the device.
     */
    constructor (ip, pw) {
        super();
        this.#ip = ip;
        this.#pw = pw;
        this.#selectedItem = '';
        this.#remoteCallInfo = '';
        this.#remoteNameNumber = '';
        this.#deviceType = DEVICE_TYPE.NONE;
        this.#deviceTypeString = '';
        this.#defaultColour = '';
        this.#inputMode = '';
        this.#display = {};
        this.#displayStringComplete = '';
        this.#displayStringSplitted = '';
        this.#kmDisplay = {};
        this.#kmStringSplitted = '';
        this.#kmStringComplete = '';
        this.#lastToastNotification = '';
        this.#lastPopupNotification = '';
        this.#callState = {};
        this.#lampState = {};
        this.#toneState = {};
        this.#speechPathTestResult = {};

        this.#fullAccess = false;
        this.#reqId = 0;
        this.#resolver = {};
        this.#clientOptions = { rejectUnauthorized: false };
        // generic exception handling that emits an error to correctly clear the connection with the device
        process.on('uncaughtException', err => this.emit('error', `uncaught exception ip[${this.#ip}] e164[${this.#e164}] msg[${err && err.message}]`));
    }

    #getReqId () {
        this.#reqId++;
        return this.#reqId.toString();
    }

    /**
     * Initialize the connection to the device via HPT port.
     * @param {object} opts - The options provided by the caller.
     * @returns {Promise}
     */
    init (opts) {
        const conf = this.#getConfWithDefaults(opts, { initTestMode: true, timeout: 5 });
        this.emit('log', `init() IP[${this.#ip}] E164[${this.#e164}] initTestMode[${conf.initTestMode}] timeout[${conf.timeout}]`);
        return new Promise(async (resolve, reject) => {
            process.stdout.write(`trying to connect to ${this.#ip}...`)
            const failTime = Math.floor(Date.now() / 1000) + conf.timeout;
            let run = true;
            do {
                await this.#establishConnection().then(() => {
                    run = false;
                })
                .catch((err) => {
                    const now = Math.floor(Date.now() / 1000);
                    if (now >= failTime)
                    {
                        console.log('failed')
                        run = false;
                    }
                    else
                    {
                        process.stdout.write('.');
                    }
                });
            } while (run === true);
            if (this.#connected === true)
            {
                const res = await this.#sendAuthRequest();
                if (res.match(/Accepted/) == false)
                {
                    throw new Error('authorization error')
                }
                if (conf.initTestMode == true)
                {
                    await this.#setupInstrumentationService();
                    await this.#setupControlMode();
                    await this.#setupStateIndication();
                    await this.#setupInternalDataItems();
                    await this.hookOff();
                    await this.sleep(1000);
                    await this.hookOn();
                    await this.sleep(500);
                }
                this.#setupKeepAlive();
                if (this.#subscribed === true) {
                    resolve(`success. ${this.#deviceTypeString} ${this.#e164}@${this.#ip} [${this.#softwareVersion}] DONGLE[${this.#fullAccess}]`);
                } else {
                    reject(`could not connect to phone test interface. Maybe another session is still active.`)
                }
            } else {
                reject(`could not connect within ${conf.timeout} seconds`)
            }
        });
    };

    #establishConnection () {
        return new Promise((resolve, reject) => {
            this.#client = connect(65532, this.#ip, this.#clientOptions, () => {
                this.#connected = true;
                this.#localAddress = this.#client.localAddress;
                this.#localPort = this.#client.localPort;
                resolve();
            });
            this.#client.setTimeout(5000, () => {
                if (this.#client.connecting === true)
                {
                    this.#client.removeAllListeners();
                    this.#client.destroy();
                    reject(`failed to connect`);
                }
            })
            this.#client.on('data', (data) => {
                data = data.toString();
                const allMessages = data.split('<opera_message').filter(elem => elem.trim().length > 0);
                allMessages.forEach(message => {
                    this.#handleData(`<opera_message${message}`.trim());
                })
            });
            this.#client.on('end', () => console.log('ended'));
            this.#client.on('error', (e) => console.error(e.message));
            this.#client.on('disconnect', () => console.log('disconnected'));
        });
    }

    #handleData (data) {
        this.emit('messages', `<<<(${data.length}): ${data}`);
        const reqId = data.match(/unique_req_id="([^"]+)/);
        if (Array.isArray(reqId) && this.#resolver[reqId[1]])
        {
            this.#resolver[reqId[1]](data);
            delete this.#resolver[reqId[1]];
        }
        else if (this.#resolver[0])
        {
            this.#resolver['0'](data);
            delete this.#resolver['0'];
        }
        else
        {
            if (this.#subscribed !== true)
            {
                this.#subscribed = true;
                this.emit('log', `IP[${this.#ip}] Successfully subscribed to phone events`)
            }
            data = data.match(/<data>([^<]+)/)
            if (Array.isArray(data))
            {
                if (REG_EX.LED.test(data[1]))
                {
                    // LED state
                    const ledState = data[1].replace(REG_EX.LED, '')
                    const ledBuf = Buffer.from(ledState, 'hex')
                    const keyId = ((ledBuf.readUInt8(0) - 1) * 256) + ledBuf.readUInt8(1);
                    if (this.#lampState[keyId] != ledState)
                    {
                        this.#lampState[keyId] = ledState;
                        this.emit('led', {key: keyId, mode: LAMPMODE[ledBuf.readUInt8(2)], colour: LAMPCOLOUR[ledBuf.readUInt8(3)]});
                    }
                }
                else if (REG_EX.CALL.test(data[1]))
                {
                    const evtState = data[1].replace(REG_EX.CALL, '')
                    const evtBuf = Buffer.from(evtState, 'hex')
                    const evtType = CALLEVT[evtBuf.readUInt8(1)]
                    let deviceId = evtBuf.toString('utf8', 3)
                    let index = '1'
                    const matchedIndex = deviceId.match(/@@@([0-9]+)/)
                    if (Array.isArray(matchedIndex)) {
                        index = matchedIndex[1];
                        deviceId = deviceId.replace(/@@@[0-9]+/, '')
                    }
                    if (this.#callState[deviceId] == undefined) {
                        this.#callState[deviceId] = {}
                    }
                    if (this.#callState[deviceId][index] != evtType)
                    {
                        this.#callState[deviceId][index] = evtType;
                        this.emit('call', {device: deviceId, index: index, state: evtType});
                    }
                }
                else if (REG_EX.DISPLAY.test(data[1]))
                {
                    const displayState = data[1].replace(REG_EX.DISPLAY, '');
                    const displayBuf = Buffer.from(displayState, 'hex');
                    const current = parseInt(displayBuf.toString('hex', 2, 4), 16);
                    const total = parseInt(displayBuf.toString('hex', 4, 6), 16);
                    const content = displayBuf.toString('hex', 6);
                    if (current === 1) {
                        this.#displayStringSplitted = '';
                    }
                    if (current <= total) {
                        this.#displayStringSplitted += content;
                    }
                    if (current === total) {
                        const serializedDisplay = Buffer.from(this.#displayStringSplitted, 'hex').toString();
                        if (this.#displayStringSplitted != this.#displayStringComplete)
                        {
                            this.#displayStringComplete = this.#displayStringSplitted;
                            this.#parseDisplayData(serializedDisplay);
                            this.emit('display', this.#display);
                        }
                    }
                }
                else if (REG_EX.KEY.test(data[1]))
                {
                    const keyData = data[1].replace(REG_EX.KEY, '')
                    const keyBuf = Buffer.from(keyData, 'hex')
                    const key = parseInt(keyBuf.toString('hex', 1, 2), 16);
                    const evt = parseInt(keyBuf.toString('hex', 2, 3), 16);
                    if (KEY_EVENTS[evt])
                    {
                        this.emit('key', {key: key, event: KEY_EVENTS[evt]});
                    }
                }
                else if (REG_EX.TONE.test(data[1]))
                {
                    this.#fullAccess = true;
                    const toneData = data[1].replace(REG_EX.TONE, '')
                    const toneBuf = Buffer.from(toneData, 'hex')
                    const tone = parseInt(toneBuf.toString('hex', 0, 1), 16);
                    const state = parseInt(toneBuf.toString('hex', 1, 2), 16);
                    if (TONES[tone] && this.#toneState[tone] != state)
                    {
                        this.#toneState[tone] = state;
                        this.emit('tone', {tone: TONES[tone], state: TONE_STATE[state]});
                    }
                }
                else if (REG_EX.KM.test(data[1]))
                {
                    const kmState = data[1].replace(REG_EX.KM, '');
                    const kmBuf = Buffer.from(kmState, 'hex');
                    const current = parseInt(kmBuf.toString('hex', 2, 4), 16);
                    const total = parseInt(kmBuf.toString('hex', 4, 6), 16);
                    const content = kmBuf.toString('hex', 6);
                    if (current === 1) {
                        this.#kmStringSplitted = '';
                    }
                    if (current <= total) {
                        this.#kmStringSplitted += content;
                    }
                    if (current === total) {
                        const serializedDisplay = Buffer.from(this.#kmStringSplitted, 'hex').toString();
                        if (this.#kmStringSplitted != this.#kmStringComplete)
                        {
                            this.#kmStringComplete = this.#kmStringSplitted;
                            this.#parseKmData(serializedDisplay);
                            this.emit('km', this.#kmDisplay);
                        }
                    }
                }
            }
        }
    }

    #sendMessage (data) {
        this.#client.write(data);
        this.emit('messages', `>>>(${data.length}): ${data}`);
    }

    #getTIMessage (data, resolve) {
        const nextReqId = this.#getReqId();
        this.#resolver[nextReqId] = resolve;
        return GET_TI_MSG_CONTENT(nextReqId, data);
    }

    #getOCMSMessage (data, resolve) {
        const nextReqId = this.#getReqId();
        this.#resolver[nextReqId] = resolve;
        return GET_OCMS_MSG_CONTENT(nextReqId, data)
    }

    #sendAuthRequest () {
        return new Promise(resolve => {
            this.#resolver['0'] = resolve;
            this.#sendMessage(GET_AUTH_REQUEST_MSG(this.#pw));
        });
    }

    #setupInstrumentationService () {
        return new Promise(resolve => {
            const data = `${DEFS.TM_INIT_REQ}${DEFS.TM_APP_SYSTEMTEST}${DEFS.TM_INIT_NULL}${this.#pw.length.toString().padStart(2, '0')}${Buffer.from(this.#pw).toString('hex')}`
            this.#sendMessage(this.#getTIMessage(data, resolve));
        });
    }

    #setupControlMode () {
        return new Promise(resolve => {
            const data = `${DEFS.TM_CONNECTION_MODE_REQ}${DEFS.TM_APP_SYSTEMTEST}${DEFS.TM_INIT_NULL}${DEFS.TM_INIT_REQ}${DEFS.TM_INIT_NULL}`
            this.#sendMessage(this.#getTIMessage(data, resolve));
        });
    }

    #setupStateIndication () {
        return new Promise(resolve => {
            const data = `${DEFS.TM_INDICATE_STATES_REQ}${DEFS.TM_APP_SYSTEMTEST}${DEFS.TM_INIT_NULL}${DEFS.TM_INIT_REQ}${DEFS.TM_SUBSCRIPTIONS}`
            this.#sendMessage(this.#getTIMessage(data, resolve));
        });
    }

    #setupInternalDataItems () {
        return new Promise(async resolve => {
            const config = await this.getConfig(['e164', 'related-device-type', 'software-version']);
            this.#e164 = config['e164'];
            this.#softwareVersion = config['software-version'] && config['software-version'].replace(/\s{2,}/g, ' ') || 'V0 R0.0.0';
            this.#setDeviceType(config['related-device-type']);
            this.#setDefaultColour();
            resolve();
        });
    }

    #setDeviceType (type) {
        this.emit('log', `setDeviceType() IP[${this.#ip}] E164[${this.#e164}] type[${type}]`);
        this.#deviceTypeString = type;
        if (type.match(/CP100/)) {
            this.#deviceType = DEVICE_TYPE.CP100;
        } else if (type.match(/CP110/)) {
            this.#deviceType = DEVICE_TYPE.CP110;
        } else if (type.match(/CP200/)) {
            this.#deviceType = DEVICE_TYPE.CP200;
        } else if (type.match(/CP205/)) {
            this.#deviceType = DEVICE_TYPE.CP205;
        } else if (type.match(/CP210/)) {
            this.#deviceType = DEVICE_TYPE.CP210;
        } else if (type.match(/CP400/)) {
            this.#deviceType = DEVICE_TYPE.CP400;
        } else if (type.match(/CP410/)) {
            this.#deviceType = DEVICE_TYPE.CP410;
        } else if (type.match(/CP600/)) {
            this.#deviceType = DEVICE_TYPE.CP600;
        } else if (type.match(/CP700/)) {
            this.#deviceType = DEVICE_TYPE.CP700;
        } else if (type.match(/CP710/)) {
            this.#deviceType = DEVICE_TYPE.CP710;
        } else {
            this.#deviceType = DEVICE_TYPE.NONE;
        }
    }

    #setDefaultColour () {
        switch (this.#deviceType) {
            case DEVICE_TYPE.CP100:
            case DEVICE_TYPE.CP110:
                this.#defaultColour = LAMPCOLOUR[1];
                break;
            case DEVICE_TYPE.CP200:
            case DEVICE_TYPE.CP205:
            case DEVICE_TYPE.CP210:
            case DEVICE_TYPE.CP400:
            case DEVICE_TYPE.CP410:
            case DEVICE_TYPE.CP600:
            case DEVICE_TYPE.CP700:
            case DEVICE_TYPE.CP710:
                this.#defaultColour = LAMPCOLOUR[3]
                break;
            default:
                this.#defaultColour = LAMPCOLOUR[0]
        }
        this.emit('log', `setDefaultColour() IP[${this.#ip}] E164[${this.#e164}] colour[${this.#defaultColour}]`);
    }

    #shutdownStateIndication () {
        this.emit('log', `shutdownStateIndication() IP[${this.#ip}] E164[${this.#e164}]`);
        return new Promise(resolve => {
            const data = `${DEFS.TM_INDICATE_STATES_REQ}${DEFS.TM_APP_SYSTEMTEST}${DEFS.TM_INIT_NULL}${DEFS.TM_INIT_REQ}${DEFS.TM_INIT_NULL}`
            this.#sendMessage(this.#getTIMessage(data, resolve));
        });
    }

    #setupKeepAlive () {
        this.emit('log', `setupKeepAlive() IP[${this.#ip}] E164[${this.#e164}]`);
        setInterval(async () => {
            await this.#sendKeepAlive();
        }, 15000);
    }

    #sendKeepAlive () {
        this.emit('log', `sendKeepAlive() IP[${this.#ip}] E164[${this.#e164}]`);
        return new Promise(resolve => {
            const data = `${DEFS.TM_KEEP_ALIVE_REQ}${DEFS.TM_APP_SYSTEMTEST}${DEFS.TM_INIT_NULL}${DEFS.TM_INIT_NULL}`
            this.#sendMessage(this.#getTIMessage(data, resolve));
        });
    }

    #parseDisplayData (data) {
        const lines = data.split(/[\r\n]{1,2}/).filter(elem => elem.trim().length > 0);
        const display = {}
        let handleObject = false;
        let handleSubItem = false;
        let currentSubObject = {}
        let currentObjectName = '';
        let currentSubObjectName = '';
        for(let i=0; i < lines.length; i++) {
            const line = lines[i].split(/:(.*)/)
            const item = line[0].trim()
            const value = line[1].trim()
            if (item == 'object') {
                handleObject = true;
                continue
            }
            if (item == 'subitem') {
                handleObject = false;
                handleSubItem = true;
                currentSubObject = {}
                if (Array.isArray(display[currentObjectName]['items']) == false)
                {
                    display[currentObjectName]['items'] = []
                }
                continue
            }
            if (item == 'name' && handleObject == true)
            {
                currentObjectName = value
                display[value] = {}
                continue
            }
            if (item == 'name' && handleSubItem == true)
            {
                currentSubObjectName = value
            }
            if (item == 'endsubitem')
            {
                handleObject = true;
                handleSubItem = false;
                display[currentObjectName]['items'].push(currentSubObject)
                continue
            }
            if (item == 'end')
            {
                handleObject = false;
                continue
            }

            if (handleObject == true)
            {
                display[currentObjectName][item] = value
            }
            if (handleSubItem == true)
            {
                currentSubObject[item] = value
            }

            // find selected item
            if (this.#deviceType >= DEVICE_TYPE.CP400 && value.match(/selected:1/))
            {
                this.#selectedItem = value.replace(/selected:1/, '').trim();
            }
            if (this.#deviceType < DEVICE_TYPE.CP400 && currentSubObjectName == 'OperaListBoxItem' && item.match(/string0/))
            {
                this.#selectedItem = value.trim();
            }

            // get text input mode
            if (this.#deviceType < DEVICE_TYPE.CP400 && value.match(/\x28[123AaBbCcHEX]{3}\x29/))
            {
                this.#inputMode = value.match(/\x28([123AaBbCcHEX]{3})\x29/)[1];
            }
            if (this.#deviceType >= DEVICE_TYPE.CP400 && value.match(/ModeNumeric|ModeCapitalised|ModeLowercase|ModeCapital/))
            {
                switch(value) {
                    case 'ModeNumeric':
                        this.#inputMode = '123';
                        break;
                    case 'ModeCapitalised':
                        this.#inputMode = 'Abc';
                        break;
                    case 'ModeLowercase':
                        this.#inputMode = 'abc';
                        break;
                    case 'ModeCapital':
                        this.#inputMode = 'ABC';
                        break;
                    default:
                        this.#inputMode = '123';
                }
            }
        }
        this.#display = display;
        if (this.#display['Toast'])
        {
            this.#lastToastNotification = JSON.stringify(this.#display['Toast'])
        }
        if (this.#display['PopupNotification'])
        {
            this.#lastPopupNotification = JSON.stringify(this.#display['PopupNotification'])
        }
        if (this.#display['PopupCall'] && this.#deviceType < DEVICE_TYPE.CP400)
        {
            this.#remoteCallInfo = JSON.stringify(this.#display['PopupCall'])
            this.#remoteNameNumber = this.#display['PopupCall']['caption'] ? this.#display['PopupCall']['caption'] : ''
        }
        if (this.#display['ContactDetails'] && this.#deviceType >= DEVICE_TYPE.CP400)
        {
            this.#remoteCallInfo = JSON.stringify(this.#display['ContactDetails'])
            this.#remoteNameNumber = this.#display['ContactDetails']['string0'] ? this.#display['ContactDetails']['string0'] : ''
            this.#remoteNameNumber+= this.#display['ContactDetails']['string1'] ? ` ${this.#display['ContactDetails']['string1']}` : ''
        }
    }

    #parseKmData (data) {
        const lines = data.split(/[\r\n]{1,2}/).filter(elem => elem.trim().length > 0);
        const kmDisplay = {}
        let handleObject = false;
        let handleSubItem = false;
        let currentSubObject = {};
        let kmId = '';
        let rowId = '';
        for(let i=0; i < lines.length; i++) {
            const line = lines[i].split(/:(.*)/)
            const item = line[0].trim()
            const value = line[1].trim()
            if (item == 'object') {
                handleObject = true;
                continue;
            }
            if (item == 'subitem') {
                handleObject = false;
                handleSubItem = true;
                currentSubObject = {};
                continue;
            }
            if (item == 'index' && handleObject == true)
            {
                kmId = value;
                kmDisplay[kmId] = { rows: {}};
                continue;
            }
            if (item == 'row' && handleSubItem == true)
            {
                rowId = value;
                continue;
            }
            if (item == 'endsubitem')
            {
                handleSubItem = false;
                kmDisplay[kmId]['rows'][rowId] = currentSubObject;
                continue;
            }
            if (item == 'end')
            {
                handleObject = false;
                continue;
            }

            if (handleObject == true && item != 'name')
            {
                kmDisplay[kmId][item] = value;
            }
            if (handleSubItem == true && item != 'name')
            {
                currentSubObject[item] = value;
            }
        }
        this.#kmDisplay = kmDisplay;
    }

    /***
        Key press/release functions
    ***/
    #keyPress (key) {
        return new Promise(resolve => {
            const keyData = Buffer.from([0x01, key, KEYS.EVT_KEY_PRESSED])
            const data = `${DEFS.TM_PUSHKEY_W_REQ}${DEFS.TM_APP_SYSTEMTEST}${DEFS.TM_INIT_NULL}${keyData.length.toString().padStart(2, '0')}${keyData.toString('hex')}`
            this.#sendMessage(this.#getTIMessage(data, resolve));
        });
    };
    
    #keyRelease (key) {
        return new Promise(resolve => {
            const keyData = Buffer.from([0x01, key, KEYS.EVT_KEY_RELEASED])
            const data = `${DEFS.TM_PUSHKEY_W_REQ}${DEFS.TM_APP_SYSTEMTEST}${DEFS.TM_INIT_NULL}${keyData.length.toString().padStart(2, '0')}${keyData.toString('hex')}`
            this.#sendMessage(this.#getTIMessage(data, resolve));
        });
    };

    /***
        OCMS set/get functions
    ***/
    #setOCMS (item, value) {
        return new Promise(resolve => {
            this.#sendMessage(this.#getOCMSMessage(SET_OCMS_DATA_MSG(item, value), resolve));
        });
    };
    
    #getOCMS (item) {
        return new Promise(resolve => {
            this.#sendMessage(this.#getOCMSMessage(GET_OCMS_DATA_MSG(item), resolve));
        });
    };

    #setInputMode (mode) {
        this.emit('log', `setInputMode() IP[${this.#ip}] E164[${this.#e164}] mode[${mode}]`)
        return new Promise(async resolve => {
            if (this.#connected === true)
            {
                let i=0
                do {
                    if (this.#inputMode == mode) return resolve(true)
                    await this.normalKeyPress(KEYS.KEY_HASH)
                    this.emit('log', `setInputMode() IP[${this.#ip}] E164[${this.#e164}] inputMode[${this.#inputMode}] mode[${mode}]`)
                    i++
                } while(i < 6)
            }
            resolve();
        });
    };

    #isLetter (str) {
        return Object.keys(CHAR).indexOf(str) >= 0
    }
    #isNumber (str) {
        return str.length === 1 && RegExp(/[0-9]/).test(str)
    }
    #isSpecial (str) {
        return Object.keys(CHAR_SPECIAL).indexOf(str) >= 0
    }

    #getConfWithDefaults (provided, defaults) {
        const conf = {};
        const keys = Object.keys(defaults);
        for (const key in keys) {
            conf[keys[key]] = (typeof provided === 'object' && provided[keys[key]]) ? provided[keys[key]] : defaults[keys[key]];
        }
        return conf;
    }

    #sendGetCodecRequest () {
        return new Promise(resolve => {
            const data = `${DEFS.TM_CODEC_REQ}${DEFS.TM_APP_SYSTEMTEST}${DEFS.TM_INIT_NULL}${DEFS.TM_INIT_REQ}${DEFS.TM_INIT_NULL}`
            this.#sendMessage(this.#getTIMessage(data, resolve));
        });
    }

    #sendSpeechTestRequest (mode, duration, delay) {
        return new Promise(resolve => {
            var durationByte4 = 0xff & duration;
            var durationByte3 = 0xff & (duration >> 8);
            var durationByte2 = 0xff & (duration >> 16);
            var durationByte1 = 0xff & (duration >> 24);
            var delayByte2 = 0xff & delay;
            var delayByte1 = 0xff & (delay >> 8);
            const testData = Buffer.from([mode, 0x00, 0x01, 0x00, 0x01, durationByte1, durationByte2, durationByte3, durationByte4, delayByte1, delayByte2])
            const data = `${DEFS.TM_SPEECH_PATH_REQ}${DEFS.TM_APP_SYSTEMTEST}${DEFS.TM_INIT_NULL}${testData.length.toString().padStart(2, '0')}${testData.toString('hex')}`
            this.#sendMessage(this.#getTIMessage(data, resolve));
        });
    }

    startSpeechTestTransmit () {
        this.emit('log', `startSpeechTestTransmit() IP[${this.#ip}] E164[${this.#e164}]`);
        return new Promise(async resolve => {
            const res = await this.#sendSpeechTestRequest(DEFS.SPEECHTEST_TM_START, 0, 0);
            const data = REG_EX.XML_DATA_VALUE.test(res) ? REG_EX.XML_DATA_VALUE.exec(res)[1] : '';
            const regEx = new RegExp(`${DEFS.SPEECHTEST_SUCCESS}${DEFS.SPEECHTEST_TM_START}`);
            if (regEx.test(data) === false) {
                this.emit('error', `startSpeechTestTransmit() IP[${this.#ip}] E164[${this.#e164}] data[${data}]`);
            }
            resolve();
        });
    }

    stopSpeechTestTransmit () {
        this.emit('log', `stopSpeechTestTransmit() IP[${this.#ip}] E164[${this.#e164}]`);
        return new Promise(async resolve => {
            const res = await this.#sendSpeechTestRequest(DEFS.SPEECHTEST_TM_STOP, 0, 0);
            const data = REG_EX.XML_DATA_VALUE.test(res) ? REG_EX.XML_DATA_VALUE.exec(res)[1] : '';
            const regEx = new RegExp(`${DEFS.SPEECHTEST_SUCCESS}${DEFS.SPEECHTEST_TM_STOP}`);
            if (regEx.test(data) === false) {
                this.emit('error', `stopSpeechTestTransmit() IP[${this.#ip}] E164[${this.#e164}] data[${data}]`);
            }
            resolve();
        });
    }

    startSpeechTestReceive () {
        this.emit('log', `startSpeechTestReceive() IP[${this.#ip}] E164[${this.#e164}]`);
        return new Promise(async resolve => {
            const res = await this.#sendSpeechTestRequest(DEFS.SPEECHTEST_RECV_START, speechTestLength, 0);
            const data = REG_EX.XML_DATA_VALUE.test(res) ? REG_EX.XML_DATA_VALUE.exec(res)[1] : '';
            const regEx = new RegExp(`${DEFS.SPEECHTEST_SUCCESS}${DEFS.SPEECHTEST_RECV_START}`);
            if (regEx.test(data) === false) {
                this.emit('error', `startSpeechTestReceive() IP[${this.#ip}] E164[${this.#e164}] data[${data}]`);
            }
            resolve();
        });
    }

    stopSpeechTestReceive () {
        this.emit('log', `stopSpeechTestReceive() IP[${this.#ip}] E164[${this.#e164}]`);
        return new Promise(async resolve => {
            const res = await this.#sendSpeechTestRequest(DEFS.SPEECHTEST_RECV_STOP, 0, 0);
            const data = REG_EX.XML_DATA_VALUE.test(res) ? REG_EX.XML_DATA_VALUE.exec(res)[1] : '';
            const regEx = new RegExp(`${DEFS.SPEECHTEST_SUCCESS}${DEFS.SPEECHTEST_RECV_STOP}`);
            if (regEx.test(data) === false) {
                this.emit('error', `stopSpeechTestReceive() IP[${this.#ip}] E164[${this.#e164}] data[${data}]`);
            }
            resolve();
        });
    }

    getSpeechTestResults () {
        this.emit('log', `getSpeechTestResults() IP[${this.#ip}] E164[${this.#e164}]`);
        return new Promise(async resolve => {
            const res = await this.#sendSpeechTestRequest(DEFS.SPEECHTEST_RESULT, 0, 0);
            const data = REG_EX.XML_DATA_VALUE.test(res) ? REG_EX.XML_DATA_VALUE.exec(res)[1] : '';
            const resultBuffer = Buffer.from(data, 'hex');
            const content = resultBuffer.toString('utf8', 10);
            try {
                this.#speechPathTestResult = JSON.parse(content);
                this.#speechPathTestResult.codec = await this.getCodec();
            } catch(e) {
                this.emit('error', `getSpeechTestResults() IP[${this.#ip}] E164[${this.#e164}] error[${e.message}] content[${content}]`);
            }
            resolve(this.#speechPathTestResult);
        });
    }

    setConfig (config) {
        this.emit('log', `setConfig() IP[${this.#ip}] E164[${this.#e164}] items[${Object.keys(config).length}]`);
        return new Promise(async resolve => {
            if (this.#connected === true)
            {
                const items = Object.keys(config)
                for (let i = 0; i < items.length; i++)
                {
                    await this.#setOCMS(items[i], config[items[i]]);
                    await this.sleep(100);
                }
            }
            resolve();
        });
    };

    getConfig (items) {
        this.emit('log', `setConfig() IP[${this.#ip}] E164[${this.#e164}] items[${items.length}]`);
        return new Promise(async resolve => {
            const config = {}
            if (this.#connected === true)
            {
                for (let i = 0; i < items.length; i++)
                {
                    let res = await this.#getOCMS(items[i]);
                    const regEx = new RegExp(`name=\"${items[i]}\"(.+)document`)
                    res = regEx.exec(res)
                    Array.isArray(res) && (res = res[1].match(/itemValue\>([^<]+)/))
                    Array.isArray(res) && (config[items[i]] = res[1])
                    await this.sleep(100);
                }
            }
            resolve(config);
        });
    };

    getSpeechPathTestResults () {
        return this.#speechPathTestResult;
    };

    getPhoneNumber () {
        return this.#e164;
    };

    getDeviceType () {
        return this.#deviceType;
    };

    getSelectedItem () {
        return this.#selectedItem;
    };

    /**
     * Get the local IP address used to connect to the device.
     * @returns {string} The local IP address used on connecting to the device
     */
    getLocalAddress () {
        return this.#localAddress;
    };

    /**
     * Get the local port used to connect to the device.
     * @returns {string} The local port used on connecting to the device
     */
    getLocalPort () {
        return this.#localPort;
    };

    assertCallState (state) {
        const currentState = this.#callState[this.#e164];
        const testedState = Array.isArray(state) ? state : [state]
        this.emit('log', `assertCallState() IP[${this.#ip}] E164[${this.#e164}] expected[${JSON.stringify(testedState)}]`)
        for (let i = 0; i < testedState.length; i++)
        {
            if (currentState && typeof currentState == 'object')
            {
                const keys = Object.keys(currentState)
                for (let j = 0; j < keys.length; j++)
                {
                    this.emit('log', `assertCallState() IP[${this.#ip}] E164[${this.#e164}] index[${keys[j]}] state[${currentState[keys[j]]}]`)
                    if (currentState[keys[j]].toLowerCase() == testedState[i].toLowerCase())
                    {
                        return
                    }
                }
            }
        }
        this.emit('error', `assertCallState() IP[${this.#ip}] E164[${this.#e164}] current[${JSON.stringify(currentState)}] expected[${JSON.stringify(testedState)}]`)
    };

    assertSelectedItem (selected) {
        this.emit('log', `assertSelectedItem() IP[${this.#ip}] E164[${this.#e164}] current[${this.#selectedItem}] expected[${selected}]`)
        if (this.#selectedItem.toLowerCase().match(selected.toLowerCase()) == false)
        {
            this.emit('error', `assertSelectedItem() IP[${this.#ip}] E164[${this.#e164}] current[${this.#selectedItem}] expected[${selected}]`)
        }
    };

    assertToast (message) {
        this.emit('log', `assertToast() IP[${this.#ip}] E164[${this.#e164}] current[${this.#lastToastNotification}] expected[${message}]`)
        if (this.#lastToastNotification.toLowerCase().match(message.toLowerCase()) == false)
        {
            this.emit('error', `assertToast() IP[${this.#ip}] E164[${this.#e164}] current[${this.#lastToastNotification}] expected[${message}]`)
        }
    };

    assertNotification (message) {
        this.emit('log', `assertNotification() IP[${this.#ip}] E164[${this.#e164}] current[${this.#lastPopupNotification}] expected[${message}]`)
        if (this.#lastPopupNotification.toLowerCase().match(message.toLowerCase()) == false)
        {
            this.emit('error', `assertNotification() IP[${this.#ip}] E164[${this.#e164}] current[${this.#lastPopupNotification}] expected[${message}]`)
        }
    };

    assertKeyState (keyId, mode, colour) {
        const assertedColour = colour || this.#defaultColour;
        let currentMode = LAMPMODE[2];
        let currentColour = LAMPCOLOUR[0];
        if (this.#lampState[keyId]) {
            const ledBuf = Buffer.from(this.#lampState[keyId], 'hex')
            currentMode = LAMPMODE[ledBuf.readUInt8(2)];
            currentColour = LAMPCOLOUR[ledBuf.readUInt8(3)];
        }
        this.emit('log', `assertKeyState IP[${this.#ip}] E164[${this.#e164}] keyId[${keyId}] current[${currentMode},${currentColour}] expected[${mode},${assertedColour}]`)
        if (currentMode != mode || currentColour != assertedColour)
        {
            this.emit('error', `assertKeyState() IP[${this.#ip}] E164[${this.#e164}] keyId[${keyId}] current[${currentMode},${currentColour}] expected[${mode},${assertedColour}]`)
        }
    };

    assertRemotePartyInfo (info) {
        this.emit('log', `assertRemotePartyInfo() IP[${this.#ip}] E164[${this.#e164}] lastNameNumber[${this.#remoteNameNumber}] info[${info}]`)
        const regex = new RegExp(info);
        if (regex.test(this.#remoteNameNumber) === false && regex.test(this.#remoteCallInfo) === false)
        {
            this.emit('error', `assertRemotePartyInfo() IP[${this.#ip}] E164[${this.#e164}] lastNameNumber[${this.#remoteNameNumber}] info[${info}]`)
        }
    };

    assertIdleState () {
        this.emit('log', `assertIdleState() IP[${this.#ip}] E164[${this.#e164}]`)
        this.assertKeyState(KEYS.KEY_LOUDSPEAKER, 'LAMP_OFF', 'NO_COLOUR')
        this.assertKeyState(KEYS.KEY_HEADSET, 'LAMP_OFF', 'NO_COLOUR')
        this.assertCallState('connectionCleared')
    }

    assertDiallingState (userProvided) {
        const conf = this.#getConfWithDefaults(userProvided, { loudspeaker: false, headset: false });
        this.emit('log', `assertDiallingState() IP[${this.#ip}] E164[${this.#e164}] loudspeaker[${conf.loudspeaker}] headset[${conf.headset}]`)
        switch (this.#deviceType)
        {
            case DEVICE_TYPE.CP100:
            case DEVICE_TYPE.CP110:
                this.assertKeyState(KEYS.LED_ALERT, 'STEADY')
                break;
            default:
                if (conf.loudspeaker === true) {
                    this.assertKeyState(KEYS.KEY_LOUDSPEAKER, 'STEADY')
                } else {
                    this.assertKeyState(KEYS.KEY_LOUDSPEAKER, 'LAMP_OFF', 'NO_COLOUR')
                }

                if (conf.headset === true) {
                    this.assertKeyState(KEYS.KEY_HEADSET, 'STEADY')
                } else {
                    this.assertKeyState(KEYS.KEY_HEADSET, 'LAMP_OFF', 'NO_COLOUR')
                }

                this.assertKeyState(KEYS.LED_ALERT, 'STEADY')
        }
        this.assertCallState('serviceInitiated')
    }

    assertConsultationCallState (userProvided) {
        const conf = this.#getConfWithDefaults(userProvided, { loudspeaker: false, headset: false, remotePartyNumber: '' });
        this.emit('log', `assertConsultationCallState() IP[${this.#ip}] E164[${this.#e164}] loudspeaker[${conf.loudspeaker}] headset[${conf.headset}]`)
        switch (this.#deviceType)
        {
            case DEVICE_TYPE.CP100:
            case DEVICE_TYPE.CP110:
                this.assertKeyState(KEYS.LED_ALERT, 'STEADY')
                break;
            default:
                if (conf.loudspeaker === true) {
                    this.assertKeyState(KEYS.KEY_LOUDSPEAKER, 'STEADY')
                } else {
                    this.assertKeyState(KEYS.KEY_LOUDSPEAKER, 'LAMP_OFF', 'NO_COLOUR')
                }

                if (conf.headset === true) {
                    this.assertKeyState(KEYS.KEY_HEADSET, 'STEADY')
                } else {
                    this.assertKeyState(KEYS.KEY_HEADSET, 'LAMP_OFF', 'NO_COLOUR')
                }

                if (this.#deviceType >= DEVICE_TYPE.CP400)
                {
                    this.assertToast(`${conf.remotePartyNumber} is now on hold`)
                }

                this.assertKeyState(KEYS.LED_ALERT, 'STEADY')
        }
        this.assertCallState('serviceInitiated')
    }

    assertIncomingCall (userProvided) {
        const conf = this.#getConfWithDefaults(userProvided, { headset: false, remotePartyInfo: '' });
        this.emit('log', `assertIncomingCall() IP[${this.#ip}] E164[${this.#e164}] headset[${conf.headset}]`)
        switch (this.#deviceType)
        {
            case DEVICE_TYPE.CP100:
            case DEVICE_TYPE.CP110:
                this.assertKeyState(KEYS.LED_ALERT, 'FLASH')
                this.assertSelectedItem('Accept')
                break;
            default:
                this.assertKeyState(KEYS.KEY_LOUDSPEAKER, 'FLASH')
                this.assertKeyState(KEYS.LED_ALERT, 'FLASH')
                if (conf.headset === true)
                {
                    this.assertKeyState(KEYS.KEY_HEADSET, 'FLASH')
                }
                this.assertSelectedItem('Answer')
        }
        this.assertCallState('delivered')
        this.assertRemotePartyInfo(conf.remotePartyInfo);
    }

    assertOutgoingCall (userProvided) {
        const conf = this.#getConfWithDefaults(userProvided, { loudspeaker: false, headset: false, remotePartyInfo: '' });
        this.emit('log', `assertOutgoingCall() IP[${this.#ip}] E164[${this.#e164}] loudspeaker[${conf.loudspeaker}] headset[${conf.headset}]`)
        switch (this.#deviceType)
        {
            case DEVICE_TYPE.CP100:
            case DEVICE_TYPE.CP110:
                this.assertKeyState(KEYS.LED_ALERT, 'STEADY')
                this.assertSelectedItem('Disconnect')
                break;
            default:
                if (conf.loudspeaker === true) {
                    this.assertKeyState(KEYS.KEY_LOUDSPEAKER, 'STEADY')
                } else {
                    this.assertKeyState(KEYS.KEY_LOUDSPEAKER, 'LAMP_OFF', 'NO_COLOUR')
                }

                if (conf.headset === true) {
                    this.assertKeyState(KEYS.KEY_HEADSET, 'STEADY')
                } else {
                    this.assertKeyState(KEYS.KEY_HEADSET, 'LAMP_OFF', 'NO_COLOUR')
                }

                this.assertKeyState(KEYS.LED_ALERT, 'STEADY')
                this.assertSelectedItem('End')
        }
        this.assertCallState('delivered')
        this.assertRemotePartyInfo(conf.remotePartyInfo);
    }

    assertConnectedCall (userProvided) {
        const conf = this.#getConfWithDefaults(userProvided, { loudspeaker: false, headset: false, remotePartyInfo: '' });
        this.emit('log', `assertConnectedCall() IP[${this.#ip}] E164[${this.#e164}] loudspeaker[${conf.loudspeaker}] headset[${conf.headset}]`)
        switch (this.#deviceType)
        {
            case DEVICE_TYPE.CP100:
            case DEVICE_TYPE.CP110:
                this.assertKeyState(KEYS.LED_ALERT, 'STEADY')
                this.assertSelectedItem('Disconnect')
                break;
            default:
                if (conf.loudspeaker === true) {
                    this.assertKeyState(KEYS.KEY_LOUDSPEAKER, 'STEADY')
                } else {
                    this.assertKeyState(KEYS.KEY_LOUDSPEAKER, 'LAMP_OFF', 'NO_COLOUR')
                }

                if (conf.headset === true) {
                    this.assertKeyState(KEYS.KEY_HEADSET, 'STEADY')
                } else {
                    this.assertKeyState(KEYS.KEY_HEADSET, 'LAMP_OFF', 'NO_COLOUR')
                }

                this.assertKeyState(KEYS.LED_ALERT, 'STEADY')
                this.assertSelectedItem('End')
        }
        this.assertCallState(['established', 'retrieved', 'conferenced']);
        this.assertRemotePartyInfo(conf.remotePartyInfo);
    }

    assertHoldState (userProvided) {
        const conf = this.#getConfWithDefaults(userProvided, { loudspeaker: false, headset: false, remotePartyNumber: '' });
        this.emit('log', `assertHoldState() IP[${this.#ip}] E164[${this.#e164}] loudspeaker[${conf.loudspeaker}] headset[${conf.headset}]`)
        switch (this.#deviceType)
        {
            case DEVICE_TYPE.CP100:
            case DEVICE_TYPE.CP110:
                this.assertKeyState(KEYS.LED_ALERT, 'LAMP_OFF', 'NO_COLOUR')
                this.assertSelectedItem('Disconnect')
                break;
            default:
                if (conf.loudspeaker === true) {
                    this.assertKeyState(KEYS.KEY_LOUDSPEAKER, 'STEADY')
                } else {
                    this.assertKeyState(KEYS.KEY_LOUDSPEAKER, 'LAMP_OFF', 'NO_COLOUR')
                }

                if (conf.headset === true) {
                    this.assertKeyState(KEYS.KEY_HEADSET, 'STEADY')
                } else {
                    this.assertKeyState(KEYS.KEY_HEADSET, 'LAMP_OFF', 'NO_COLOUR')
                }

                if (this.#deviceType >= DEVICE_TYPE.CP400)
                {
                    this.assertToast(`${conf.remotePartyNumber} is now on hold`)
                }

                this.assertKeyState(KEYS.LED_ALERT, 'STEADY', 'YELLOW')
                this.assertSelectedItem('End')
        }
        this.assertCallState('held')
    }

    assertHeldState (userProvided) {
        const conf = this.#getConfWithDefaults(userProvided, { loudspeaker: false, headset: false });
        this.emit('log', `assertHeldState() IP[${this.#ip}] E164[${this.#e164}] loudspeaker[${conf.loudspeaker}] headset[${conf.headset}]`)
        switch (this.#deviceType)
        {
            case DEVICE_TYPE.CP100:
            case DEVICE_TYPE.CP110:
                this.assertKeyState(KEYS.LED_ALERT, 'STEADY')
                this.assertSelectedItem('Disconnect')
                break;
            default:
                if (conf.loudspeaker === true) {
                    this.assertKeyState(KEYS.KEY_LOUDSPEAKER, 'STEADY')
                } else {
                    this.assertKeyState(KEYS.KEY_LOUDSPEAKER, 'LAMP_OFF', 'NO_COLOUR')
                }

                if (conf.headset === true) {
                    this.assertKeyState(KEYS.KEY_HEADSET, 'STEADY')
                } else {
                    this.assertKeyState(KEYS.KEY_HEADSET, 'LAMP_OFF', 'NO_COLOUR')
                }

                this.assertKeyState(KEYS.LED_ALERT, 'STEADY')
                this.assertSelectedItem('End')
        }
        this.assertCallState('held')
    }

    assertEndedCallIdle (userProvided) {
        const conf = this.#getConfWithDefaults(userProvided, { remotePartyNumber: '' });
        this.emit('log', `assertEndedCallIdle() IP[${this.#ip}] E164[${this.#e164}] remotePartyNumber[${conf.remotePartyNumber}]`)
        this.assertKeyState(KEYS.KEY_LOUDSPEAKER, 'LAMP_OFF', 'NO_COLOUR')
        this.assertKeyState(KEYS.KEY_HEADSET, 'LAMP_OFF', 'NO_COLOUR')
        this.assertKeyState(KEYS.LED_ALERT, 'LAMP_OFF', 'NO_COLOUR')
        this.assertCallState('connectionCleared')
        switch (this.#deviceType)
        {
            case DEVICE_TYPE.CP100:
            case DEVICE_TYPE.CP110:
            case DEVICE_TYPE.CP200:
            case DEVICE_TYPE.CP205:
            case DEVICE_TYPE.CP210:
                this.assertNotification(`Ends: ${conf.remotePartyNumber}`)
                break;
            default:
                this.assertToast(`Call with ${conf.remotePartyNumber} ended`)
        }
    }

    sleep (time) {
        this.emit('log', `sleep() IP[${this.#ip}] E164[${this.#e164}] time[${time}]`)
        return new Promise(resolve => {
            setTimeout(() => {
                resolve();
            }, time)
        });
    };

    shutdown () {
        this.emit('log', `shutdown() IP[${this.#ip}] E164[${this.#e164}]`)
        return new Promise(async resolve => {
            if (this.#client && this.#connected === true)
            {
                this.#connected = false;
                await this.hookOff();
                await this.hookOn();
                await this.#shutdownStateIndication();
                this.#client.destroy();
            }
            resolve();
        });
    }

    hookOff () {
        this.emit('log', `hookOff() IP[${this.#ip}] E164[${this.#e164}]`)
        return new Promise(resolve => {
            const hookData = Buffer.from([0x01, KEYS.KEY_HOOKSWITCH, KEYS.EVT_HOOK_OFF])
            const data = `${DEFS.TM_PUSHKEY_W_REQ}${DEFS.TM_APP_SYSTEMTEST}${DEFS.TM_INIT_NULL}${hookData.length.toString().padStart(2, '0')}${hookData.toString('hex')}`
            this.#sendMessage(this.#getTIMessage(data, resolve));
        });
    };

    hookOn () {
        this.emit('log', `hookOn() IP[${this.#ip}] E164[${this.#e164}]`)
        return new Promise(resolve => {
            const hookData = Buffer.from([0x01, KEYS.KEY_HOOKSWITCH, KEYS.EVT_HOOK_ON])
            const data = `${DEFS.TM_PUSHKEY_W_REQ}${DEFS.TM_APP_SYSTEMTEST}${DEFS.TM_INIT_NULL}${hookData.length.toString().padStart(2, '0')}${hookData.toString('hex')}`
            this.#sendMessage(this.#getTIMessage(data, resolve));
        });
    };

    dial (keys) {
        this.emit('log', `dial() IP[${this.#ip}] E164[${this.#e164}] keys[${keys}]`)
        return new Promise(async resolve => {
            if (this.#connected === true)
            {
                for (let i = 0; i < keys.length; i++)
                {
                    await this.normalKeyPress(NUMPAD[keys[i]]);
                }
            }
            resolve();
        });
    };

    write (text) {
        this.emit('log', `write() IP[${this.#ip}] E164[${this.#e164}] text[${text}]`)
        return new Promise(async resolve => {
            if (this.#connected === true)
            {
                for (let i = 0; i < text.length; i++)
                {
                    const char_normal = text[i]
                    const char_ascii  = Buffer.from(text[i].toLowerCase(), 'utf8').toString('hex')
                    if (this.#isNumber(char_normal) === true)
                    {
                        await this.#setInputMode('123')
                        await this.dial(char_normal)
                    }
                    else if (this.#isSpecial(char_ascii) === true)
                    {
                        await this.#setInputMode('abc')
                        await this.dial(CHAR_SPECIAL[char_ascii])
                    }
                    else if (this.#isLetter(char_ascii) === true)
                    {
                        if (char_normal == char_normal.toUpperCase()) {
                            await this.#setInputMode('Abc')
                            await this.dial(CHAR[char_ascii])
                        } else {
                            await this.#setInputMode('abc')
                            await this.dial(CHAR[char_ascii])
                        }
                    }
                    await this.sleep(500)
                }
            }
            resolve();
        });
    };

    longKeyPress (key) {
        this.emit('log', `longKeyPress() IP[${this.#ip}] E164[${this.#e164}] key[${key}]`)
        return new Promise(async resolve => {
            if (this.#connected === true)
            {
                await this.#keyPress(key);
                await this.sleep(2000);
                await this.#keyRelease(key);
                await this.sleep(500);
            }
            resolve();
        });
    };

    normalKeyPress (key) {
        this.emit('log', `normalKeyPress() IP[${this.#ip}] E164[${this.#e164}] key[${key}]`)
        return new Promise(async resolve => {
            if (this.#connected === true)
            {
                await this.#keyPress(key);
                await this.sleep(500);
                await this.#keyRelease(key);
                await this.sleep(500);
            }
            resolve();
        });
    };

    scrollUntil (target) {
        const targets = Array.isArray(target) ? target : [target]
        this.emit('log', `scrollUntil() IP[${this.#ip}] E164[${this.#e164}] targets[${JSON.stringify(targets)}]`)
        return new Promise(async resolve => {
            if (this.#connected === true)
            {
                await this.longKeyPress(KEYS.KEY_NAVI_UP);
                let currentSelected = this.#selectedItem;
                let lastSelected = this.#selectedItem;
                do {
                    if (targets.filter(elem => currentSelected.match(elem)).length > 0) return resolve(true);
                    lastSelected = currentSelected;
                    await this.down();
                    currentSelected = this.#selectedItem;
                    this.emit('log', `scrollUntil() IP[${this.#ip}] E164[${this.#e164}] currentSelected[${currentSelected}] lastSelected[${lastSelected}] targets[${JSON.stringify(targets)}]`)
                    if (lastSelected == currentSelected)
                    {
                        this.emit('error', `scrollUntil() IP[${this.#ip}] E164[${this.#e164}] currentSelected[${currentSelected}] lastselected[${lastSelected}] targets[${JSON.stringify(targets)}]`)
                        return resolve(false);
                    }
                } while(true)
            } else {
                resolve(false);
            }
        });
    };

    ok () {
        this.emit('log', `ok() IP[${this.#ip}] E164[${this.#e164}]`)
        return new Promise(async resolve => {
            if (this.#connected === true)
            {
                await this.#keyPress(KEYS.KEY_NAVI_OK);
                await this.sleep(500);
                await this.#keyRelease(KEYS.KEY_NAVI_OK);
                await this.sleep(500);
            }
            resolve();
        });
    };

    up () {
        this.emit('log', `up() IP[${this.#ip}] E164[${this.#e164}]`)
        return new Promise(async resolve => {
            if (this.#connected === true)
            {
                await this.#keyPress(KEYS.KEY_NAVI_UP);
                await this.sleep(500);
                await this.#keyRelease(KEYS.KEY_NAVI_UP);
                await this.sleep(500);
            }
            resolve();
        });
    };

    down () {
        this.emit('log', `down() IP[${this.#ip}] E164[${this.#e164}]`)
        return new Promise(async resolve => {
            if (this.#connected === true)
            {
                await this.#keyPress(KEYS.KEY_NAVI_DOWN);
                await this.sleep(500);
                await this.#keyRelease(KEYS.KEY_NAVI_DOWN);
                await this.sleep(500);
            }
            resolve();
        });
    };

    left () {
        this.emit('log', `left() IP[${this.#ip}] E164[${this.#e164}]`)
        return new Promise(async resolve => {
            if (this.#connected === true)
            {
                await this.#keyPress(KEYS.KEY_NAVI_LEFT);
                await this.sleep(500);
                await this.#keyRelease(KEYS.KEY_NAVI_LEFT);
                await this.sleep(500);
            }
            resolve();
        });
    };

    right () {
        this.emit('log', `right() IP[${this.#ip}] E164[${this.#e164}]`)
        return new Promise(async resolve => {
            if (this.#connected === true)
            {
                await this.#keyPress(KEYS.KEY_NAVI_RIGHT);
                await this.sleep(500);
                await this.#keyRelease(KEYS.KEY_NAVI_RIGHT);
                await this.sleep(500);
            }
            resolve();
        });
    };

    restart () {
        this.emit('log', `restart() IP[${this.#ip}] E164[${this.#e164}]`)
        return new Promise(async resolve => {
            if (this.#connected === true)
            {
                await this.#keyPress(KEYS.COMBO_RESTART);
                await this.sleep(1500);
                await this.dial(this.#pw);
                await this.ok();
                this.#client.destroy();
            }
            resolve();
        });
    };

    factoryReset () {
        this.emit('log', `factoryReset() IP[${this.#ip}] E164[${this.#e164}]`)
        return new Promise(async resolve => {
            if (this.#connected === true)
            {
                await this.#keyPress(KEYS.COMBO_RESET);
                await this.sleep(1500);
                await this.dial('124816');
                await this.ok();
                this.#client.destroy();
            }
            resolve();
        });
    };

    fakeHeadsetConnected () {
        this.emit('log', `fakeHeadsetConnected() IP[${this.#ip}] E164[${this.#e164}]`)
        return new Promise(async resolve => {
            if (this.#connected === true)
            {
                await this.#keyPress(KEYS.SOCKET_HEADSET);
                await this.sleep(250);
            }
            resolve();
        });
    };

    fakeHeadsetDisconnected () {
        this.emit('log', `fakeHeadsetDisconnected() IP[${this.#ip}] E164[${this.#e164}]`)
        return new Promise(async resolve => {
            if (this.#connected === true)
            {
                await this.#keyRelease(KEYS.SOCKET_HEADSET);
                await this.sleep(250);
            }
            resolve();
        });
    };

    goToAdmin () {
        this.emit('log', `goToAdmin() IP[${this.#ip}] E164[${this.#e164}]`)
        return new Promise(async resolve => {
            if (this.#connected === true)
            {
                await this.#keyPress(KEYS.COMBO_ADMIN);
                await this.sleep(1500);
                await this.dial(this.#pw);
                await this.ok();
            }
            resolve();
        });
    };

    getCodec () {
        this.emit('log', `getCodec() IP[${this.#ip}] E164[${this.#e164}]`);
        return new Promise(async resolve => {
            const res = await this.#sendGetCodecRequest();
            const data = REG_EX.XML_DATA_VALUE.test(res) ? REG_EX.XML_DATA_VALUE.exec(res)[1] : '';
            let txCodec = 'Unknown';
            if (data && REG_EX.CODEC.test(data))
            {
                const codec = data.replace(REG_EX.CODEC, '');
                if (Object.keys(CODECS).indexOf(codec) >= 0)
                {
                    txCodec = CODECS[codec];
                }
            }
            resolve(txCodec);
        });
    }

    testSpeechPathTo (userProvided) {
        const conf = this.#getConfWithDefaults(userProvided, { otherDevice: null, length: 5000, minQuality: 3 });
        if (conf.otherDevice === null || conf.otherDevice instanceof Device === false)
        {
            this.emit('error', `testSpeechPathTo() IP[${this.#ip}] E164[${this.#e164}] otherDevice must be provided`)
            return;
        }
        if (this.#fullAccess !== true)
        {
            this.emit('error', `testSpeechPathTo() IP[${this.#ip}] E164[${this.#e164}] dongle must be installed to run speech path test`)
            return;
        }
        this.emit('log', `testSpeechPathTo() IP[${this.#ip}] E164[${this.#e164}] otherDevice[${conf.otherDevice.getPhoneNumber()}]`);
        return new Promise(async resolve => {
            await this.startSpeechTestTransmit();
            await conf.otherDevice.startSpeechTestReceive();
            await this.sleep(conf.length);
            await conf.otherDevice.stopSpeechTestReceive();
            await this.stopSpeechTestTransmit();
            const result = await conf.otherDevice.getSpeechTestResults();
            if (result.VQT < conf.minQuality)
            {
                this.emit('error', `testSpeechPathTo() IP[${this.#ip}] E164[${this.#e164}] minQuality[${conf.minQuality}] VQT[${result.VQT}]`);
            }
            resolve();
        });
    }
}

module.exports = {
    Device,
    KEYS,
    DEVICE_TYPE
};
