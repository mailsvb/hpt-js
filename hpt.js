const tls = require('tls');
const util = require('util');
const EventEmitter = require('events').EventEmitter;
const { SAUCE_VERSION, DEFS, REG_EX, LAMPMODE, LAMPCOLOUR, CALLEVT, GET_AUTH_REQUEST_MSG, GET_TI_MSG_CONTENT, GET_OCMS_MSG_CONTENT, SET_OCMS_DATA_MSG, GET_OCMS_DATA_MSG } = require('./sauce.js')
const SAUCE_REQUIRED = 1;

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

if (SAUCE_VERSION != SAUCE_REQUIRED) {
    console.error(`SAUCE version mismatch required=${SAUCE_REQUIRED} sauce=${SAUCE_VERSION}`)
    process.exit()
}

const Device = function(ip, pw)
{
    const _self = this;
    this.ip = ip;
    this.pw = pw;
    this.client = null;
    this.connected = false;
    this.selectedItem = '';
    this.callInfo = ''
    this.e164 = '';
    this.deviceType = DEVICE_TYPE.NONE;
    this.deviceTypeString = '';
    this.defaultColour = '';

    this.clientOptions = {
        rejectUnauthorized: false
    };

    this.display = {};
    this.displayString = '';
    this.tmpDisplayString = '';
    this.lastToast = '';
    this.lastPopupNotification = '';
    this.callState = {};
    this.lampState = {};
    this.resolve = {};
    this.auth = false;
    this.reqId = 0;

    this._getReqId = function()
    {
        _self.reqId++;
        return _self.reqId.toString();
    }

    this.establishConnection = function() {
        return new Promise((resolve, reject) => {
            _self.client = tls.connect(65532, _self.ip, _self.clientOptions, function()
            {
                _self.connected = true;
                resolve();
            });
            _self.client.setTimeout(5000, () => {
                if (_self.client.connecting === true)
                {
                    _self.client.removeAllListeners();
                    _self.client.destroy();
                    reject(`failed to connect`);
                }
            })
            _self.client.on('data', (data) => {
                data = data.toString();
                const allMessages = data.split('<opera_message').filter(elem => elem.trim().length > 0);
                allMessages.forEach(message => {
                    _self.handleData(`<opera_message${message}`.trim());
                })
            });
            _self.client.on('end', () => console.log('ended'));
            _self.client.on('error', (e) => console.error(e.message));
            _self.client.on('disconnect', () => console.log('disconnected'));
        });
    }

    this.handleData = function(data)
    {
        _self.emit('log', `<<<(${data.length}): ${data}`);
        const reqId = data.match(/unique_req_id="([^"]+)/);
        if (Array.isArray(reqId) && _self.resolve[reqId[1]])
        {
            _self.resolve[reqId[1]](data);
            delete _self.resolve[reqId[1]];
        }
        else if (_self.resolve[0])
        {
            _self.resolve['0'](data);
            delete _self.resolve['0'];
        }
        else
        {
            data = data.match(/<data>([^<]+)/)
            if (Array.isArray(data))
            {
                if (REG_EX.LED.test(data[1]))
                {
                    // LED state
                    const ledState = data[1].replace(REG_EX.LED, '')
                    const ledBuf = Buffer.from(ledState, 'hex')
                    const keyId = ((ledBuf.readUInt8(0) - 1) * 256) + ledBuf.readUInt8(1);
                    if (_self.lampState[keyId] != ledState)
                    {
                        _self.lampState[keyId] = ledState;
                        _self.emit('led', {key: keyId, mode: LAMPMODE[ledBuf.readUInt8(2)], colour: LAMPCOLOUR[ledBuf.readUInt8(3)]});
                    }
                }
                else if (REG_EX.CALL.test(data[1]))
                {
                    const evtState = data[1].replace(REG_EX.CALL, '')
                    const evtBuf = Buffer.from(evtState, 'hex')
                    const evtType = CALLEVT[evtBuf.readUInt8(1)]
                    const deviceId = evtBuf.toString('utf8', 3)
                    if (_self.callState[deviceId] != evtType)
                    {
                        _self.callState[deviceId] = evtType;
                        _self.emit('call', {device: deviceId, state: evtType});
                    }
                }
                else if (REG_EX.DISPLAY.test(data[1]))
                {
                    const displayState = data[1].replace(REG_EX.DISPLAY, '')
                    const displayBuf = Buffer.from(displayState, 'hex')
                    const current = parseInt(displayBuf.toString('hex', 2, 4))
                    const total = parseInt(displayBuf.toString('hex', 4, 6))
                    const content = displayBuf.toString('hex', 6)
                    if (current <= total) {
                        _self.tmpDisplayString += content;
                    }
                    if (current == total) {
                        const serializedDisplay = Buffer.from(_self.tmpDisplayString, 'hex').toString()
                        if (_self.tmpDisplayString != _self.displayString)
                        {
                            _self.displayString = _self.tmpDisplayString;
                            _self.tmpDisplayString = '';
                            _self.parseDisplayData(serializedDisplay)
                            _self.emit('display', _self.display);
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
                        _self.emit('key', {key: key, event: KEY_EVENTS[evt]});
                    }
                }
            }
        }
    }

    this.sendMessage = function(data)
    {
        _self.client.write(data);
        _self.emit('log', `>>>(${data.length}): ${data}`);
    }

    this.getTIMessage = function(data, resolve)
    {
        const nextReqId = _self._getReqId();
        _self.resolve[nextReqId] = resolve;
        return GET_TI_MSG_CONTENT(nextReqId, data);
    }

    this.getOCMSMessage = function(data, resolve)
    {
        const nextReqId = _self._getReqId();
        _self.resolve[nextReqId] = resolve;
        return GET_OCMS_MSG_CONTENT(nextReqId, data)
    }

    this.sendAuthRequest = function()
    {
        return new Promise(resolve => {
            _self.resolve['0'] = resolve;
            _self.sendMessage(GET_AUTH_REQUEST_MSG(_self.pw));
        });
    }

    this.setupInstrumentationService = function()
    {
        return new Promise(resolve => {
            const data = `${DEFS.TM_INIT_REQ}${DEFS.TM_APP_SYSTEMTEST}${DEFS.TM_INIT_NULL}${_self.pw.length.toString().padStart(2, '0')}${Buffer.from(_self.pw).toString('hex')}`
            _self.sendMessage(_self.getTIMessage(data, resolve));
        });
    }

    this.setupControlMode = function()
    {
        return new Promise(resolve => {
            const data = `${DEFS.TM_CONNECTION_MODE_REQ}${DEFS.TM_APP_SYSTEMTEST}${DEFS.TM_INIT_NULL}${DEFS.TM_INIT_REQ}${DEFS.TM_INIT_NULL}`
            _self.sendMessage(_self.getTIMessage(data, resolve));
        });
    }

    this.setupStateIndication = function()
    {
        return new Promise(resolve => {
            const data = `${DEFS.TM_INDICATE_STATES_REQ}${DEFS.TM_APP_SYSTEMTEST}${DEFS.TM_INIT_NULL}${DEFS.TM_INIT_REQ}${DEFS.TM_SUBSCRIPTIONS}`
            _self.sendMessage(_self.getTIMessage(data, resolve));
        });
    }

    this.setupInternalDataItems = function()
    {
        return new Promise(async resolve => {
            const config = await _self.getConfig(['e164', 'related-device-type'])
            _self.e164 = config['e164'];
            _self.deviceType = _self.getDeviceType(config['related-device-type'])
            _self.setDefaultColour()
            resolve();
        });
    }

    this.getDeviceType = function(type)
    {
        this.deviceTypeString = type;
        if (type.match(/CP100/)) {
            return DEVICE_TYPE.CP100;
        } else if (type.match(/CP110/)) {
            return DEVICE_TYPE.CP110;
        } else if (type.match(/CP200/)) {
            return DEVICE_TYPE.CP200;
        } else if (type.match(/CP205/)) {
            return DEVICE_TYPE.CP205;
        } else if (type.match(/CP210/)) {
            return DEVICE_TYPE.CP210;
        } else if (type.match(/CP400/)) {
            return DEVICE_TYPE.CP400;
        } else if (type.match(/CP410/)) {
            return DEVICE_TYPE.CP410;
        } else if (type.match(/CP600/)) {
            return DEVICE_TYPE.CP600;
        } else if (type.match(/CP700/)) {
            return DEVICE_TYPE.CP700;
        } else if (type.match(/CP710/)) {
            return DEVICE_TYPE.CP710;
        } else {
            return DEVICE_TYPE.NONE;
        }
    }

    this.setDefaultColour = function()
    {
        switch (_self.deviceType) {
            case DEVICE_TYPE.CP100:
            case DEVICE_TYPE.CP110:
                _self.defaultColour = LAMPCOLOUR[1];
                break;
            case DEVICE_TYPE.CP200:
            case DEVICE_TYPE.CP205:
            case DEVICE_TYPE.CP210:
            case DEVICE_TYPE.CP400:
            case DEVICE_TYPE.CP410:
            case DEVICE_TYPE.CP600:
            case DEVICE_TYPE.CP700:
            case DEVICE_TYPE.CP710:
                _self.defaultColour = LAMPCOLOUR[3]
                break;
            default:
                _self.defaultColour = LAMPCOLOUR[0]
        }
    }

    this.shutdownStateIndication = function()
    {
        return new Promise(resolve => {
            const data = `${DEFS.TM_INDICATE_STATES_REQ}${DEFS.TM_APP_SYSTEMTEST}${DEFS.TM_INIT_NULL}${DEFS.TM_INIT_REQ}${DEFS.TM_INIT_NULL}`
            _self.sendMessage(_self.getTIMessage(data, resolve));
        });
    }

    this.setupKeepAlive = function()
    {
        setInterval(async function() {
            await _self.sendKeepAlive();
        }, 15000);
    }

    this.sendKeepAlive = function()
    {
        return new Promise(resolve => {
            const data = `${DEFS.TM_KEEP_ALIVE_REQ}${DEFS.TM_APP_SYSTEMTEST}${DEFS.TM_INIT_NULL}${DEFS.TM_INIT_NULL}`
            _self.sendMessage(_self.getTIMessage(data, resolve));
        });
    }

    this.parseDisplayData = function(data)
    {
        const lines = data.split(/[\r\n]{1,2}/).filter(elem => elem.trim().length > 0);
        const display = {}
        let handleObject = false;
        let handleSubItem = false;
        let currentSubObject = {}
        let currentObjectName = '';
        let currentSubObjectName = '';
        let newSubitem = false;
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
            if (_self.deviceType >= DEVICE_TYPE.CP400 && value.match(/selected:1/))
            {
                _self.selectedItem = value.replace(/selected:1/, '').trim();
            }
            if (_self.deviceType < DEVICE_TYPE.CP400 && currentSubObjectName == 'OperaListBoxItem' && item.match(/string0/))
            {
                _self.selectedItem = value.trim();
            }
        }
        _self.display = display;
        if (_self.display['Toast'])
        {
            _self.lastToast = JSON.stringify(_self.display['Toast'])
        }
        if (_self.display['PopupNotification'])
        {
            _self.lastPopupNotification = JSON.stringify(_self.display['PopupNotification'])
        }
        if (_self.display['PopupCall'] && _self.deviceType < DEVICE_TYPE.CP400)
        {
            _self.callInfo = JSON.stringify(_self.display['PopupCall'])
        }
        if (_self.display['ContactDetails'] && _self.deviceType >= DEVICE_TYPE.CP400)
        {
            _self.callInfo = JSON.stringify(_self.display['ContactDetails'])
        }
    }

    /***
        Key press/release functions
    ***/
    this._keyPress = function(key) {
        const _self = this;
        return new Promise(resolve => {
            const keyData = Buffer.from([01, key, KEYS.EVT_KEY_PRESSED])
            const data = `${DEFS.TM_PUSHKEY_W_REQ}${DEFS.TM_APP_SYSTEMTEST}${DEFS.TM_INIT_NULL}${keyData.length.toString().padStart(2, '0')}${keyData.toString('hex')}`
            _self.sendMessage(_self.getTIMessage(data, resolve));
        });
    };
    this._keyRelease = function(key) {
        const _self = this;
        return new Promise(resolve => {
            const keyData = Buffer.from([01, key, KEYS.EVT_KEY_RELEASED])
            const data = `${DEFS.TM_PUSHKEY_W_REQ}${DEFS.TM_APP_SYSTEMTEST}${DEFS.TM_INIT_NULL}${keyData.length.toString().padStart(2, '0')}${keyData.toString('hex')}`
            _self.sendMessage(_self.getTIMessage(data, resolve));
        });
    };

    /***
        OCMS set/get functions
    ***/
    this._setOCMS = function(item, value) {
        const _self = this;
        return new Promise(resolve => {
            _self.sendMessage(_self.getOCMSMessage(SET_OCMS_DATA_MSG(item, value), resolve));
        });
    };
    this._getOCMS = function(item) {
        const _self = this;
        return new Promise(resolve => {
            _self.sendMessage(_self.getOCMSMessage(GET_OCMS_DATA_MSG(item), resolve));
        });
    };
}
util.inherits(Device, EventEmitter);

Device.prototype.init = function(initTestMode, lazyTime = 5) {
    const _self = this;
    return new Promise(async (resolve, reject) => {
        process.stdout.write(`trying to connect to ${_self.ip}...`)
        const failTime = Math.floor(Date.now() / 1000) + lazyTime;
        let run = true;
        do {
            await _self.establishConnection().then(() => {
                run = false;
            })
            .catch((err) => {
                const now = Math.floor(Date.now() / 1000);
                if (now >= failTime)
                {
                    console.log('failed')
                    run = false;
                    reject(`could not connect within ${lazyTime} seconds`)
                }
                else
                {
                    process.stdout.write('.');
                }
            });
        } while (run === true);
        const res = await _self.sendAuthRequest();
        if (res.match(/Accepted/) == false)
        {
            throw new Error('authorization error')
        }
        else if (initTestMode == true)
        {
            await _self.setupInstrumentationService();
            await _self.setupControlMode();
            await _self.setupStateIndication();
            await _self.setupInternalDataItems();
            await _self.hookOff();
            await _self.sleep(1000);
            await _self.hookOn();
            await _self.sleep(500);
        }
        _self.setupKeepAlive();
        resolve(`success. ${_self.deviceTypeString} ${_self.e164}@${_self.ip}`);
    });
};

Device.prototype.setConfig = function(config) {
    const _self = this;
    return new Promise(async resolve => {
        const items = Object.keys(config)
        for (let i = 0; i < items.length; i++)
        {
            await _self._setOCMS(items[i], config[items[i]]);
            await _self.sleep(100);
        }
        resolve();
    });
};

Device.prototype.getConfig = function(items) {
    const _self = this;
    return new Promise(async resolve => {
        const config = {}
        for (let i = 0; i < items.length; i++)
        {
            let res = await _self._getOCMS(items[i]);
            const regEx = new RegExp(`name=\"${items[i]}\"(.+)document`)
            res = regEx.exec(res)
            Array.isArray(res) && (res = res[1].match(/itemValue\>([^<]+)/))
            Array.isArray(res) && (config[items[i]] = res[1])
            await _self.sleep(100);
        }
        resolve(config);
    });
};

Device.prototype.getPhoneNumber = function() {
    const _self = this;
    return _self.e164;
};

Device.prototype.getSelectedItem = function() {
    const _self = this;
    return _self.selectedItem;
};

Device.prototype.assertCallState = function(state) {
    const _self = this;
    const currentState = _self.callState[_self.e164];
    const testedState = Array.isArray(state) ? state : [state]
    for (let i = 0; i < testedState.length; i++)
    {
        if (currentState && currentState.toLowerCase() == testedState[i].toLowerCase())
        {
            return;
        }
    }
    _self.emit('error', `assertCallState e164[${_self.e164}] current[${currentState}] expected[${JSON.stringify(testedState)}]`)
};

Device.prototype.assertSelectedItem = function(selected) {
    const _self = this;
    const currentSelected = _self.selectedItem
    if (currentSelected.toLowerCase().match(selected.toLowerCase()) == false)
    {
        _self.emit('error', `assertSelectedItem e164[${_self.e164}] current[${currentSelected}] expected[${selected}]`)
    }
};

Device.prototype.assertToast = function(message) {
    const _self = this;
    const lastToast = _self.lastToast
    if (lastToast.toLowerCase().match(message.toLowerCase()) == false)
    {
        _self.emit('error', `assertToast e164[${_self.e164}] current[${lastToast}] expected[${message}]`)
    }
};

Device.prototype.assertNotification = function(message) {
    const _self = this;
    const lastPopupNotification = _self.lastPopupNotification
    if (lastPopupNotification.toLowerCase().match(message.toLowerCase()) == false)
    {
        _self.emit('error', `assertNotification e164[${_self.e164}] current[${lastPopupNotification}] expected[${message}]`)
    }
};

Device.prototype.assertKeyState = function(keyId, mode, colour) {
    const _self = this;
    const assertedColour = colour || _self.defaultColour;
    let currentMode = LAMPMODE[2];
    let currentColour = LAMPCOLOUR[0];
    if (_self.lampState[keyId]) {
        const ledBuf = Buffer.from(_self.lampState[keyId], 'hex')
        currentMode = LAMPMODE[ledBuf.readUInt8(2)];
        currentColour = LAMPCOLOUR[ledBuf.readUInt8(3)];
    }
    if (currentMode != mode || currentColour != assertedColour)
    {
        _self.emit('error', `assertKeyState e164[${_self.e164}] keyId[${keyId}] current[${currentMode},${currentColour}] expected[${mode},${assertedColour}]`)
    }
};

Device.prototype.assertIdleState = function() {
    const _self = this;
    _self.assertKeyState(KEYS.KEY_LOUDSPEAKER, 'LAMP_OFF', 'NO_COLOUR')
    _self.assertKeyState(KEYS.KEY_HEADSET, 'LAMP_OFF', 'NO_COLOUR')
    _self.assertKeyState(KEYS.LED_ALERT, 'LAMP_OFF', 'NO_COLOUR')
    _self.assertCallState('connectionCleared')
}

Device.prototype.assertDiallingState = function(conf = { loudspeaker: false, headset: false }) {
    const _self = this;
    switch (_self.deviceType)
    {
        case DEVICE_TYPE.CP100:
        case DEVICE_TYPE.CP110:
            _self.assertKeyState(KEYS.LED_ALERT, 'STEADY')
            break;
        default:
            if (conf.loudspeaker === true) {
                _self.assertKeyState(KEYS.KEY_LOUDSPEAKER, 'STEADY')
            } else {
                _self.assertKeyState(KEYS.KEY_LOUDSPEAKER, 'LAMP_OFF', 'NO_COLOUR')
            }

            if (conf.headset === true) {
                _self.assertKeyState(KEYS.KEY_HEADSET, 'STEADY')
            } else {
                _self.assertKeyState(KEYS.KEY_HEADSET, 'LAMP_OFF', 'NO_COLOUR')
            }

            _self.assertKeyState(KEYS.LED_ALERT, 'STEADY')
    }
    _self.assertCallState('serviceInitiated')
}

Device.prototype.assertIncomingCall = function(conf = { headset: false }) {
    const _self = this;
    switch (_self.deviceType)
    {
        case DEVICE_TYPE.CP100:
        case DEVICE_TYPE.CP110:
            _self.assertKeyState(KEYS.LED_ALERT, 'FLASH')
            _self.assertSelectedItem('Accept')
            break;
        default:
            _self.assertKeyState(KEYS.KEY_LOUDSPEAKER, 'FLASH')
            _self.assertKeyState(KEYS.LED_ALERT, 'FLASH')
            if (conf.headset === true)
            {
                _self.assertKeyState(KEYS.KEY_HEADSET, 'FLASH')
            }
            _self.assertSelectedItem('Answer')
    }
    _self.assertCallState('delivered')
}

Device.prototype.assertOutgoingCall = function(conf = { loudspeaker: false, headset: false }) {
    const _self = this;
    switch (_self.deviceType)
    {
        case DEVICE_TYPE.CP100:
        case DEVICE_TYPE.CP110:
            _self.assertKeyState(KEYS.LED_ALERT, 'STEADY')
            _self.assertSelectedItem('Disconnect')
            break;
        default:
            if (conf.loudspeaker === true) {
                _self.assertKeyState(KEYS.KEY_LOUDSPEAKER, 'STEADY')
            } else {
                _self.assertKeyState(KEYS.KEY_LOUDSPEAKER, 'LAMP_OFF', 'NO_COLOUR')
            }

            if (conf.headset === true) {
                _self.assertKeyState(KEYS.KEY_HEADSET, 'STEADY')
            } else {
                _self.assertKeyState(KEYS.KEY_HEADSET, 'LAMP_OFF', 'NO_COLOUR')
            }

            _self.assertKeyState(KEYS.LED_ALERT, 'STEADY')
            _self.assertSelectedItem('End')
    }
    _self.assertCallState('delivered')
}

Device.prototype.assertConnectedCall = function(conf = { loudspeaker: false, headset: false }) {
    const _self = this;
    switch (_self.deviceType)
    {
        case DEVICE_TYPE.CP100:
        case DEVICE_TYPE.CP110:
            _self.assertKeyState(KEYS.LED_ALERT, 'STEADY')
            _self.assertSelectedItem('Disconnect')
            break;
        default:
            if (conf.loudspeaker === true) {
                _self.assertKeyState(KEYS.KEY_LOUDSPEAKER, 'STEADY')
            } else {
                _self.assertKeyState(KEYS.KEY_LOUDSPEAKER, 'LAMP_OFF', 'NO_COLOUR')
            }

            if (conf.headset === true) {
                _self.assertKeyState(KEYS.KEY_HEADSET, 'STEADY')
            } else {
                _self.assertKeyState(KEYS.KEY_HEADSET, 'LAMP_OFF', 'NO_COLOUR')
            }

            _self.assertKeyState(KEYS.LED_ALERT, 'STEADY')
            _self.assertSelectedItem('End')
    }
    _self.assertCallState(['established', 'retrieved'])
}

Device.prototype.assertHoldState = function(conf = { loudspeaker: false, headset: false }) {
    const _self = this;
    switch (_self.deviceType)
    {
        case DEVICE_TYPE.CP100:
        case DEVICE_TYPE.CP110:
            _self.assertKeyState(KEYS.LED_ALERT, 'LAMP_OFF', 'NO_COLOUR')
            _self.assertSelectedItem('Disconnect')
            break;
        default:
            if (conf.loudspeaker === true) {
                _self.assertKeyState(KEYS.KEY_LOUDSPEAKER, 'STEADY')
            } else {
                _self.assertKeyState(KEYS.KEY_LOUDSPEAKER, 'LAMP_OFF', 'NO_COLOUR')
            }

            if (conf.headset === true) {
                _self.assertKeyState(KEYS.KEY_HEADSET, 'STEADY')
            } else {
                _self.assertKeyState(KEYS.KEY_HEADSET, 'LAMP_OFF', 'NO_COLOUR')
            }

            _self.assertKeyState(KEYS.LED_ALERT, 'STEADY', 'YELLOW')
            _self.assertSelectedItem('End')
    }
    _self.assertCallState('held')
}

Device.prototype.assertHeldState = function(conf = { loudspeaker: false, headset: false }) {
    const _self = this;
    switch (_self.deviceType)
    {
        case DEVICE_TYPE.CP100:
        case DEVICE_TYPE.CP110:
            _self.assertKeyState(KEYS.LED_ALERT, 'STEADY')
            _self.assertSelectedItem('Disconnect')
            break;
        default:
            if (conf.loudspeaker === true) {
                _self.assertKeyState(KEYS.KEY_LOUDSPEAKER, 'STEADY')
            } else {
                _self.assertKeyState(KEYS.KEY_LOUDSPEAKER, 'LAMP_OFF', 'NO_COLOUR')
            }

            if (conf.headset === true) {
                _self.assertKeyState(KEYS.KEY_HEADSET, 'STEADY')
            } else {
                _self.assertKeyState(KEYS.KEY_HEADSET, 'LAMP_OFF', 'NO_COLOUR')
            }

            _self.assertKeyState(KEYS.LED_ALERT, 'STEADY')
            _self.assertSelectedItem('End')
    }
    _self.assertCallState('held')
}

Device.prototype.assertEndedCallIdle = function(conf = { remotePartyNumber: '' }) {
    const _self = this;
    _self.assertKeyState(KEYS.KEY_LOUDSPEAKER, 'LAMP_OFF', 'NO_COLOUR')
    _self.assertKeyState(KEYS.KEY_HEADSET, 'LAMP_OFF', 'NO_COLOUR')
    _self.assertKeyState(KEYS.LED_ALERT, 'LAMP_OFF', 'NO_COLOUR')
    _self.assertCallState('connectionCleared')
    switch (_self.deviceType)
    {
        case DEVICE_TYPE.CP100:
        case DEVICE_TYPE.CP110:
        case DEVICE_TYPE.CP200:
        case DEVICE_TYPE.CP205:
        case DEVICE_TYPE.CP210:
            _self.assertNotification(`Ends: ${conf.remotePartyNumber}`)
            break;
        default:
            _self.assertToast(`Call with ${conf.remotePartyNumber} ended`)
    }
}

Device.prototype.assertDisplayText = function() {
    const _self = this;
    console.log(util.inspect(_self.display, { showHidden: true, depth: null }))
};

Device.prototype.sleep = function(time) {
    const _self = this;
    return new Promise(resolve => {
        setTimeout(() => {
            resolve();
        }, time)
    });
};

Device.prototype.shutdown = function()
{
    const _self = this;
    return new Promise(async resolve => {
        if (_self.client && _self.connected === true)
        {
            _self.connected = false;
            await _self.hookOff();
            await _self.hookOn();
            await _self.shutdownStateIndication();
            _self.client.destroy();
        }
        resolve();
    });
}

Device.prototype.hookOff = function() {
    const _self = this;
    return new Promise(resolve => {
        const hookData = Buffer.from([01, KEYS.KEY_HOOKSWITCH, KEYS.EVT_HOOK_OFF])
        const data = `${DEFS.TM_PUSHKEY_W_REQ}${DEFS.TM_APP_SYSTEMTEST}${DEFS.TM_INIT_NULL}${hookData.length.toString().padStart(2, '0')}${hookData.toString('hex')}`
        _self.sendMessage(_self.getTIMessage(data, resolve));
    });
};

Device.prototype.hookOn = function() {
    const _self = this;
    return new Promise(resolve => {
        const hookData = Buffer.from([01, KEYS.KEY_HOOKSWITCH, KEYS.EVT_HOOK_ON])
        const data = `${DEFS.TM_PUSHKEY_W_REQ}${DEFS.TM_APP_SYSTEMTEST}${DEFS.TM_INIT_NULL}${hookData.length.toString().padStart(2, '0')}${hookData.toString('hex')}`
        _self.sendMessage(_self.getTIMessage(data, resolve));
    });
};

Device.prototype.dial = function(keys) {
    const _self = this;
    return new Promise(async resolve => {
        if (_self.connected === true)
        {
            for (let i = 0; i < keys.length; i++)
            {
                await _self.normalKeyPress(NUMPAD[keys[i]]);
            }
        }
        resolve();
    });
};

Device.prototype.longKeyPress = function(key) {
    const _self = this;
    return new Promise(async resolve => {
        if (_self.connected === true)
        {
            await _self._keyPress(key);
            await _self.sleep(2000);
            await _self._keyRelease(key);
            await _self.sleep(500);
        }
        resolve();
    });
};

Device.prototype.normalKeyPress = function(key) {
    const _self = this;
    return new Promise(async resolve => {
        if (_self.connected === true)
        {
            await _self._keyPress(key);
            await _self.sleep(500);
            await _self._keyRelease(key);
            await _self.sleep(500);
        }
        resolve();
    });
};

Device.prototype.scrollUntil = function(target) {
    const _self = this;
    return new Promise(async resolve => {
        if (_self.connected === true)
        {
            await _self.longKeyPress(KEYS.KEY_NAVI_UP);
            let currentSelected = lastselected = _self.selectedItem;
            do {
                if (currentSelected.match(target)) return resolve(true);
                lastSelected = currentSelected;
                await _self.down();
                currentSelected = _self.selectedItem;
                if (lastSelected == currentSelected) {
                    _self.emit('error', `scrollUntil currentSelected[${currentSelected}] lastselected[${lastselected}] target[${target}]`)
                    return resolve(false);
                }
            } while(true)
        } else {
            resolve(false);
        }
    });
};

Device.prototype.ok = function() {
    const _self = this;
    return new Promise(async resolve => {
        if (_self.connected === true)
        {
            await _self._keyPress(KEYS.KEY_NAVI_OK);
            await _self.sleep(500);
            await _self._keyRelease(KEYS.KEY_NAVI_OK);
            await _self.sleep(500);
        }
        resolve();
    });
};

Device.prototype.up = function() {
    const _self = this;
    return new Promise(async resolve => {
        if (_self.connected === true)
        {
            await _self._keyPress(KEYS.KEY_NAVI_UP);
            await _self.sleep(500);
            await _self._keyRelease(KEYS.KEY_NAVI_UP);
            await _self.sleep(500);
        }
        resolve();
    });
};

Device.prototype.down = function() {
    const _self = this;
    return new Promise(async resolve => {
        if (_self.connected === true)
        {
            await _self._keyPress(KEYS.KEY_NAVI_DOWN);
            await _self.sleep(500);
            await _self._keyRelease(KEYS.KEY_NAVI_DOWN);
            await _self.sleep(500);
        }
        resolve();
    });
};

Device.prototype.left = function() {
    const _self = this;
    return new Promise(async resolve => {
        if (_self.connected === true)
        {
            await _self._keyPress(KEYS.KEY_NAVI_LEFT);
            await _self.sleep(500);
            await _self._keyRelease(KEYS.KEY_NAVI_LEFT);
            await _self.sleep(500);
        }
        resolve();
    });
};

Device.prototype.right = function() {
    const _self = this;
    return new Promise(async resolve => {
        if (_self.connected === true)
        {
            await _self._keyPress(KEYS.KEY_NAVI_RIGHT);
            await _self.sleep(500);
            await _self._keyRelease(KEYS.KEY_NAVI_RIGHT);
            await _self.sleep(500);
        }
        resolve();
    });
};

Device.prototype.restart = function() {
    const _self = this;
    return new Promise(async resolve => {
        if (_self.connected === true)
        {
            await _self._keyPress(KEYS.COMBO_RESTART);
            await _self.sleep(1500);
            await _self.dial(_self.pw);
            await _self.ok();
            _self.client.destroy();
        }
        resolve();
    });
};

Device.prototype.factoryReset = function() {
    const _self = this;
    return new Promise(async resolve => {
        if (_self.connected === true)
        {
            await _self._keyPress(KEYS.COMBO_RESET);
            await _self.sleep(1500);
            await _self.dial('124816');
            await _self.ok();
            _self.client.destroy();
        }
        resolve();
    });
};

Device.prototype.fakeHeadsetConnected = function() {
    const _self = this;
    return new Promise(async resolve => {
        if (_self.connected === true)
        {
            await _self._keyPress(KEYS.SOCKET_HEADSET);
            await _self.sleep(250);
        }
        resolve();
    });
};

Device.prototype.fakeHeadsetDisconnected = function() {
    const _self = this;
    return new Promise(async resolve => {
        if (_self.connected === true)
        {
            await _self._keyRelease(KEYS.SOCKET_HEADSET);
            await _self.sleep(250);
        }
        resolve();
    });
};

module.exports = {
    Device,
    KEYS
};
