const fs = require('fs');
const readline = require('readline');
const path = require('path');

async function parseLogFileStream(logFilePath) {
    const logMap = new Map();
    const fileStream = fs.createReadStream(logFilePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    const hashRegex = /Sent (static|dynamic) tip transaction to region ([a-z]+): ([A-Za-z0-9]+)/;
    const spamRegex = /Sent spam transaction through RPC \d+: ([A-Za-z0-9]+)/;
    const timeRegex = /Total time spent: (\d+)ms\. Jupiter quote time: (\d+)ms/;
    let currentTimeInfo = null;

    for await (const line of rl) {
        const cleanLine = line.replace(/\[\d+m/g, '');

        const timeMatch = cleanLine.match(timeRegex);
        if (timeMatch) {
            currentTimeInfo = {
                timeSpent: parseInt(timeMatch[1]),
                quoteTime: parseInt(timeMatch[2])
            };
            continue;
        }

        // Check for tip transactions
        const hashMatch = cleanLine.match(hashRegex);
        if (hashMatch && currentTimeInfo) {
            const region = hashMatch[2];
            const hash = hashMatch[3];
            
            logMap.set(hash, {
                region: region,
                type: hashMatch[1],
                timeSpent: currentTimeInfo.timeSpent,
                quoteTime: currentTimeInfo.quoteTime
            });
        }

        // Check for spam transactions
        const spamMatch = cleanLine.match(spamRegex);
        if (spamMatch) {
            const hash = spamMatch[1];
            logMap.set(hash, {
                region: 'spam',
                type: 'spam',
                timeSpent: currentTimeInfo?.timeSpent || null,
                quoteTime: currentTimeInfo?.quoteTime || null
            });
        }
    }

    return logMap;
}

async function processSignaturesFileStream(filePath) {
    const content = await fs.promises.readFile(filePath, 'utf8');
    try {
        const jsonContent = content.replace(/\/\/[^\n]*\n/g, '');
        
        if (jsonContent.trim().startsWith('{')) {
            return jsonContent.trim()
                .replace(/[{}]/g, '')
                .split(',')
                .map(sig => sig.trim().replace(/"/g, ''))
                .filter(sig => sig.length > 0);
        }
        
        return JSON.parse(jsonContent);
    } catch (e) {
        console.error('Error processing signatures file:', e);
        return [];
    }
}

async function writeCSVStream(outputPath, transactions) {
    const writeStream = fs.createWriteStream(outputPath);
    
    writeStream.write('Transaction Hash,Type,Region,Time Spent (ms),Quote Time (ms)\n');
    
    const foundTransactions = transactions.filter(tx => tx.found);
    for (const tx of foundTransactions) {
        writeStream.write(`${tx.signature},${tx.type},${tx.region},${tx.timeSpent},${tx.quoteTime}\n`);
    }
    
    if (foundTransactions.length > 0) {
        const avgTimeSpent = foundTransactions.reduce((sum, tx) => sum + (tx.timeSpent || 0), 0) / foundTransactions.length;
        const avgQuoteTime = foundTransactions.reduce((sum, tx) => sum + (tx.quoteTime || 0), 0) / foundTransactions.length;
        
        writeStream.write('\nStatistics:\n');
        writeStream.write(`Average Time Spent (ms),${avgTimeSpent.toFixed(2)}\n`);
        writeStream.write(`Average Quote Time (ms),${avgQuoteTime.toFixed(2)}\n`);
        
        const typeCounts = {};
        const regionCounts = {};
        foundTransactions.forEach(tx => {
            typeCounts[tx.type] = (typeCounts[tx.type] || 0) + 1;
            regionCounts[tx.region] = (regionCounts[tx.region] || 0) + 1;
        });
        
        writeStream.write('\nTransactions by Type:\n');
        Object.entries(typeCounts).forEach(([type, count]) => {
            writeStream.write(`${type},${count}\n`);
        });

        writeStream.write('\nTransactions by Region:\n');
        Object.entries(regionCounts).forEach(([region, count]) => {
            writeStream.write(`${region},${count}\n`);
        });
    }
    
    return new Promise((resolve, reject) => {
        writeStream.end(() => resolve());
        writeStream.on('error', reject);
    });
}

async function analyzeTransactions(signaturesFilePath, logFilePath) {
    try {
        console.log('Reading signatures...');
        const signatures = await processSignaturesFileStream(signaturesFilePath);
        
        console.log('Parsing log file...');
        const logMap = await parseLogFileStream(logFilePath);
        
        console.log('Processing transactions...');
        const analyzedTransactions = signatures.map(signature => ({
            signature: signature,
            type: logMap.get(signature)?.type || 'unknown',
            region: logMap.get(signature)?.region || 'unknown',
            timeSpent: logMap.get(signature)?.timeSpent || null,
            quoteTime: logMap.get(signature)?.quoteTime || null,
            found: logMap.has(signature)
        }));
        
        const outputFileName = 'transaction_analysis.csv';
        console.log('Writing results...');
        await writeCSVStream(outputFileName, analyzedTransactions);
        
        const foundCount = analyzedTransactions.filter(tx => tx.found).length;
        console.log('\nAnalysis complete:');
        console.log('------------------------');
        console.log('Total signatures:', signatures.length);
        console.log('Transactions found in logs:', foundCount);
        console.log('Output saved to:', outputFileName);
        
        return true;
    } catch (error) {
        console.error('Error analyzing transactions:', error);
        return false;
    }
}

async function main() {
    console.log('=== Solana Transaction Log Analyzer ===\n');
    
    const signaturesFile = '_signatures.json';
    
    if (!fs.existsSync('paste.txt')) {
        console.error('Error: Log file (paste.txt) not found in the current directory.');
        return;
    }
    
    console.log('Processing signatures file:', signaturesFile);
    console.log('Using log file: paste.txt');
    
    await analyzeTransactions(signaturesFile, 'paste.txt');
}

main().catch(console.error);
