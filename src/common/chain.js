import { networks } from 'bitcoinjs-lib';
import Constants from './constants';
import env from '../env.json';

/**
 * The bitcoin network that env.json selects. It needs no Node built-ins, so the main process
 * and the renderer (which checks addresses as they are typed) both use it.
 */

let c_network;

switch (env.network) {
case Constants.Networks.Testnet:
    c_network = networks.testnet;
    break;
case Constants.Networks.Bitcoin:
    c_network = networks.bitcoin;
    break;
default:
    throw new Error('Unknown network in env file');
}

export default {
    current: c_network,
    name: env.network,
};
