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
        AverageBytes: 255,
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
