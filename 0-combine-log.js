const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');


async function combineLogFiles() {
    try {
        // Read all files in current directory
        const files = fs.readdirSync(process.cwd());
        
        // Filter for .log files
        const logFiles = files.filter(file => path.extname(file) === '.log');
        
        if (logFiles.length === 0) {
            console.log('No .log files found in current directory');
            return;
        }

        // Create write stream
        const writeStream = fs.createWriteStream('paste.txt');
        
        // Process each log file sequentially
        for (const logFile of logFiles) {
            console.log(`Processing: ${logFile}`);
            
            // Write file header
            writeStream.write(`\n=== ${logFile} ===\n`);
            
            // Create read stream for current log file
            const readStream = fs.createReadStream(logFile, {
                encoding: 'utf8',
                highWaterMark: 64 * 1024 // 64KB chunks
            });
            
            // Use pipeline to handle streaming properly
            await pipeline(
                readStream,
                async function* (source) {
                    for await (const chunk of source) {
                        yield chunk;
                    }
                    yield '\n'; // Add newline after each file
                },
                writeStream,
                { end: false } // Don't end writeStream after each file
            );
        }
        
        // Close the write stream after all files are processed
        writeStream.end();
        console.log(`Successfully combined ${logFiles.length} log files into paste.txt`);
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Run the function
combineLogFiles().catch(error => {
    console.error('Fatal error:', error);
});