# JSWallet

This is a companion to my [Medium tutotial](https://medium.com/@michael.m/lets-create-a-secure-hd-bitcoin-wallet-in-electron-react-js-575032c42bf3).

It is **not** production code and should be used for educational puproses only.

## Installation

```
git clone https://github.com/mmick66/jswallet.git
cd jswallet
npm install
npm start
```

## Design Principles

Key derivation is the beating heart of a Bitcoin Wallet and most security concerns have to do with this first step.

My code is mainly intended as an illustration of the following patter:

<p align="center"> 
  <img src="https://github.com/mmick66/jswallet/blob/master/assets/Key%20Chain.png">
</p>

## Warnings

As stated above this is **not** production code. 
It is set to work with *testnet* by default but by a simple change in the `env.js` it could well function with real bitcoins!


## Moving Forward

If anyone outhere has any coold suggestions on developing this pet project further please submit ideas in the issues tab.
