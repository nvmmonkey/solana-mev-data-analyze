const axios = require("axios");
const csv = require("csv-parser");
const fs = require("fs");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const bs58 = require("bs58");
require("dotenv").config();

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const WSOL_MINT = "So11111111111111111111111111111111111111112";
const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

const csvWriter = createCsvWriter({
  path: "output.csv",
  header: [
    { id: "txHash", title: "Transaction Hash" },
    { id: "type", title: "Type" },
    { id: "blockDate", title: "Block Date" },
    { id: "region", title: "Region" },
    { id: "timeSpent", title: "Time Spent (ms)" },
    { id: "quoteTime", title: "Quote Time (ms)" },
    { id: "beforeSOL", title: "Before SOL" },
    { id: "afterSOL", title: "After SOL" },
    { id: "jitoTip", title: "Jito Tip" },
    { id: "botFee", title: "Bot Fee" },
    { id: "jitoPercentage", title: "Jito %" },
    { id: "botPercentage", title: "Bot %" },
    { id: "profit", title: "Profit" },
    { id: "profitUSD", title: "Profit in $" },
    { id: "botMemo", title: "Bot Memo" }
  ],
});

async function getTransactionData(txHash) {
  try {
    if (
      !txHash ||
      txHash.includes("Statistics") ||
      txHash.includes("Transactions by Region") ||
      txHash.includes("Average") ||
      ["tokyo", "amsterdam", "frankfurt", "slc", "ny"].includes(txHash)
    ) {
      return null;
    }

    const response = await axios.post(
      "https://api.helius.xyz/v0/transactions/?api-key=" + HELIUS_API_KEY,
      {
        transactions: [txHash],
      }
    );

    const [data] = response.data;

    if (!data) {
      console.error(`No data found for tx: ${txHash}`);
      return null;
    }

    const botAddress = data.feePayer;
    let totalWsolIn = 0;
    let totalWsolOut = 0;

    data.tokenTransfers.forEach((transfer) => {
      if (transfer.mint === WSOL_MINT) {
        if (transfer.toUserAccount === botAddress) {
          totalWsolIn += transfer.tokenAmount;
        }
        if (transfer.fromUserAccount === botAddress) {
          totalWsolOut += transfer.tokenAmount;
        }

        console.log(
          `WSOL transfer: ${
            transfer.fromUserAccount === botAddress ? "OUT" : "IN"
          } - ${transfer.tokenAmount} WSOL`
        );
      }
    });

    let botMemo = "";
    if (data.instructions && data.instructions.length > 0) {
      const memoInstruction = data.instructions.find(
        (instruction) => instruction.programId === MEMO_PROGRAM_ID
      );

      if (memoInstruction && memoInstruction.data) {
        try {
          const decodedBytes = bs58.decode(memoInstruction.data);
          botMemo = new TextDecoder().decode(decodedBytes);
        } catch (error) {
          console.warn(
            `Could not decode memo for tx ${txHash}: ${error.message}`
          );
          botMemo = memoInstruction.data;
        }
      }
    }

    const jitoTip =
      data.nativeTransfers
        .filter((transfer) => transfer.fromUserAccount === botAddress)
        .reduce((sum, transfer) => sum + transfer.amount, 0) / 1e9;

    console.log(`Transaction ${txHash}:`);
    console.log(`Total WSOL in: ${totalWsolIn}`);
    console.log(`Total WSOL out: ${totalWsolOut}`);
    console.log(`Jito tip: ${jitoTip}`);
    console.log(`Memo: ${botMemo}`);

    const botFee = jitoTip * 0.1;
    const jitoPercentage = (jitoTip / totalWsolIn) * 100;
    const botPercentage = 1.5;
    const profit = totalWsolIn - totalWsolOut;
    const profitUSD = profit * 30;

    const blockDate = new Date(data.timestamp * 1000).toUTCString();

    return {
      blockDate,
      beforeSOL: totalWsolIn.toFixed(9),
      afterSOL: totalWsolOut.toFixed(9),
      jitoTip: jitoTip.toFixed(9),
      botFee: botFee.toFixed(9),
      jitoPercentage: jitoPercentage.toFixed(2),
      botPercentage: botPercentage.toFixed(2),
      profit: profit.toFixed(9),
      profitUSD: `$${profitUSD.toFixed(2)}`,
      botMemo
    };
  } catch (error) {
    console.error(`Error processing tx ${txHash}: ${error.message}`);
    return null;
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processCSV() {
  console.log("\nStarting CSV processing...");
  const results = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream("transaction_analysis.csv")
      .pipe(csv())
      .on("data", (data) => {
        if (
          data["Transaction Hash"] &&
          !data["Transaction Hash"].includes("Statistics")
        ) {
          results.push(data);
        }
      })
      .on("end", async () => {
        console.log(`Processing ${results.length} transactions...`);

        const processedData = [];
        let processed = 0;

        for (const row of results) {
          const txData = await getTransactionData(row["Transaction Hash"]);

          if (txData) {
            processedData.push({
              txHash: row["Transaction Hash"],
              type: row["Type"],
              ...txData,
              region: row.Region,
              timeSpent: row["Time Spent (ms)"],
              quoteTime: row["Quote Time (ms)"]
            });
          }

          processed++;
          console.log(`Processed ${processed}/${results.length} transactions`);

          if (processed < results.length) {
            await sleep(50);
          }
        }

        console.log(`Writing ${processedData.length} rows to output CSV...`);
        try {
          await csvWriter.writeRecords(processedData);
          console.log("CSV processing completed successfully");
          resolve();
        } catch (error) {
          console.error("Error writing output CSV:", error);
          reject(error);
        }
      });
  });
}

console.log("Starting script...");
processCSV()
  .then(() => {
    console.log("Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });
