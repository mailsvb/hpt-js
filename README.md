# hpt-js
nodejs based implementation of HPT for remote controlling an OpenScape DeskPhone CP device

## Getting started
Get your copy of the library from [here](https://github.com/mailsvb/hpt-js/releases/latest) or clone the repository.
```
git clone https://github.com/mailsvb/hpt-js.git
```
Integrate the library into your test cases

- Device: used to interact with an OpenScape DeskPhone CP devices
- KEYS: reference to physical keys and/or LEDs
- DEVICE_TYPE: reference to the configured device type
```
const { Device, KEYS, DEVICE_TYPE } = require('./hpt.js')
```

You also need sauce.js, which contains the message details that are exchanged between the phone and hpt-js.
This is proprietary and kept as a secret.

## Usage examples
The library exposes several functions and event emitters. All Details can be found in the [wiki](https://github.com/mailsvb/hpt-js/wiki)
