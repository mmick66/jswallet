export default {
    Bitcoin: {
        Decimals: 8,
        Satoshis: 100000000,
    },
    Networks: {
        Testnet: 'testnet',
        Bitcoin: 'bitcoin',
    },
    Transactions: {
        // Sizes in vbytes of the transactions this wallet makes, see src/common/fee.js
        Vbytes: {
            Overhead: 10, // version, locktime and the input and output counts
            Input: 148, // P2PKH, with a compressed key and a signature of at most 72 bytes
            Change: 34, // P2PKH, as the change pays this wallet's address
            // P2TR and P2WSH, the largest receivers in use (an unassigned witness version allows 51)
            LargestOutput: 43,
        },
        DustLimit: 546, // satoshis; smaller P2PKH outputs are non-standard
    },
    Endpoints: {
        Fees: '/v1/fees/recommended', // relative to the network's apiBase in env.json
        Prices: 'https://mempool.space/api/v1/prices',
        PriceChart: 'https://api.blockchain.info/charts/market-price',
    },
    ReturnValues: {
        Fragments: {
            MinimumFeeNotMet: 'min relay fee not met',
            WrongPassword: 'Wrong password',
        },
    },
    Messages: {
        Wallet: {
            Created: 'Your wallet has been created and saved!',
            Mnemonic: 'Store this sequence safely',
            Failed: 'A wallet could not be created at this moment',
        },
        Transactions: {
            NOTSent: 'Transaction could not be sent',
            Sent: 'Your transaction was sent'
        },
        Errors: {
            FeeNotMet: 'A fee to process this transaction was not provided'
        }
    }
};
