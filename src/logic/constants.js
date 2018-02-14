export default {
    Bitcoin: {
        Decimals: 8,
        Satoshis: 100000000,
        Networks: {
            Testnet: 'testnet',
            Bitcoin: 'bitcoin',
        }
    },
    ReturnValues: {
        TransactionSubmitted: 'Transaction Submitted',
        NoFreeOutputs: 'No free outputs to spend',
    },
    Messages: {
        Wallet: {
            Created: 'Your wallet has been created and saved!',
            Mnemonic: 'Save the word sequence to restore the key',
            Failed: 'A wallet could not be created at this moment',
        }
    }
};
