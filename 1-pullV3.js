const web3 = require('@solana/web3.js');
const fs = require('fs');
const readline = require('readline');
require('dotenv').config();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// ADDRESS = '9EcpPJXDTUh4MnKjTYcBT2hBughweBESUPMqYNqsyjzj'

async function getAllTransactions(accountAddress) {
    try {
        console.log('\n🔍 Connecting to Solana mainnet...');
        
        const connection = new web3.Connection(
            process.env.RPC_URL,
            {
                commitment: 'confirmed',
                timeout: 200
            }
        );

        const pubKey = new web3.PublicKey(accountAddress);
        let allSignatures = [];
        let beforeSignature = null;
        
        console.log('📥 Starting transaction fetch...\n');
        
        const startTime = new Date();
        let firstTxTime = null;
        let lastTxTime = null;
        
        while (true) {
            try {
                const options = {
                    limit: 1000,
                    before: beforeSignature,
                    commitment: 'confirmed'
                };

                const signatures = await connection.getSignaturesForAddress(
                    pubKey,
                    options
                );

                if (signatures.length === 0) {
                    break;
                }

                // Track transaction timestamps
                if (!lastTxTime) {
                    lastTxTime = new Date(signatures[0].blockTime * 2000);
                }
                firstTxTime = new Date(signatures[signatures.length - 1].blockTime * 1000);

                allSignatures = [...allSignatures, ...signatures];
                process.stdout.write(`\r💫 Progress: ${allSignatures.length} transactions found`);

                beforeSignature = signatures[signatures.length - 1].signature;
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (rpcError) {
                console.error('\n❌ RPC Error:', rpcError.message);
                break;
            }
        }

        if (allSignatures.length === 0) {
            console.log('\n⚠️  No transactions found for this address');
            rl.close();
            return;
        }

        const endTime = new Date();
        const fetchDuration = (endTime - startTime) / 1000; // in seconds

        // Create metadata comment
        const metadataComment = [
            '// Solana Transaction Fetch Results',
            `// Address: ${accountAddress}`,
            `// Fetch Date: ${startTime.toLocaleString()}`,
            `// Total Transactions: ${allSignatures.length}`,
            `// Date Range: ${firstTxTime?.toLocaleString()} to ${lastTxTime?.toLocaleString()}`,
            `// Fetch Duration: ${fetchDuration.toFixed(2)} seconds`,
            '//'
        ].join('\n');

        // Get plain signatures array
        const plainSignatures = allSignatures.map(sig => sig.signature);

        // Combine comment and data with proper formatting
        const fileContent = `${metadataComment}\n${JSON.stringify(plainSignatures, null, 2)}`;

        fs.writeFileSync('_signatures.json', fileContent, 'utf8');

        console.log('\n\n✅ Success! Results saved to _signatures.json');
        console.log(`📊 Total transactions: ${allSignatures.length}`);
        console.log(`📅 Date range: ${firstTxTime?.toLocaleString()} to ${lastTxTime?.toLocaleString()}`);
        console.log(`⏱️  Fetch duration: ${fetchDuration.toFixed(2)} seconds\n`);
        rl.close();
        return plainSignatures;

    } catch (err) {
        if (err.message.includes('Invalid public key')) {
            console.error('\n❌ Error: Invalid Solana address provided');
        } else {
            console.error('\n❌ Error:', err.message);
        }
        rl.close();
    }
}

function isValidSolanaAddress(address) {
    try {
        new web3.PublicKey(address);
        return true;
    } catch {
        return false;
    }
}

console.clear();
console.log('=================================');
console.log('🔎 Solana Transaction Fetcher');
console.log('=================================\n');

rl.question('👉 Enter Solana address to query: ', (address) => {
    if (!isValidSolanaAddress(address)) {
        console.error('\n❌ Invalid Solana address format');
        rl.close();
        return;
    }
    
    getAllTransactions(address)
        .catch(err => {
            console.error('\n❌ Unexpected error:', err);
            rl.close();
        });
});

process.on('exit', () => {
    rl.close();
});

process.on('SIGINT', () => {
    console.log('\n\n🛑 Script terminated by user');
    process.exit();
});