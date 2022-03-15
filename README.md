# hpt-js
nodejs based implementation of HPT for controlling and tesing OpenScape DeskPhone CP devices

## Getting started
Clone this repository and create your first test case
```
git clone https://github.com/mailsvb/hpt-js/hpt-js.git
```

## Introduction
After cloning the repository, you can integrate the hpt-js library into your test case

- Device: used to interact with an OpenScape DeskPhone CP devices
- KEYS: reference to physical keys and/or LEDs
```
const { Device, KEYS } = require('./hpt.js')
```

You also need sauce.js, which contains the message details that are exchanged between the phone and hpt-js.
This is proprietary and kept as a secret.

## Usage examples
The library exposes several functions and event emitters. All Details can be found in the [wiki](https://github.com/mailsvb/hpt-js/wiki)
