# JSWallet

![Screen Shot](https://github.com/mmick66/jswallet/blob/master/assets/Screen_Shot.png)


This is a companion to my [Medium tutotial](https://medium.com/@michael.m/lets-create-a-secure-hd-bitcoin-wallet-in-electron-react-js-575032c42bf3).

It is **not** production code and should be used for educational puproses only.

> It seems that at this moment, testnet is experiencing a tremendous amount of tranffic which has rendered the network practically unusable. The faucets are down and the transactions are stuck. We will all have to wait for while.

## Installation

```
git clone https://github.com/mmick66/jswallet.git
cd jswallet
npm install
npm start
```

## Design Principles

Key derivation is the beating heart of a Bitcoin Wallet and most security concerns have to do with this first step.

My code is mainly intended as an illustration of the following pattern:

![Key Derivation](https://github.com/mmick66/jswallet/blob/master/assets/Key%20Chain.png)

## Building

This project was built using [electron-forge](https://github.com/electron-userland/electron-forge). I have had problems building it in some machines and apparently the [issue is not uncommon](https://github.com/electron-userland/electron-forge/issues/434). In theory it should work like so...

```
npm publish
```

## Warnings

As stated above this is **not** production code. 
It is set to work with *testnet* by default but by a simple change in the `env.js` it could well function with real bitcoins!

