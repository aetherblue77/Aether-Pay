import { ethers, network } from "hardhat"
import * as fs from "fs"
import * as path from "path"
import type { AetherPay, IERC20 } from "../typechain-types"

function getIgnitionAddress(contractName: string): string {
    const chainId = network.config.chainId
    const deploymentPath = path.join(__dirname, `../ignition/deployments/chain-${chainId}/deployed_addresses.json`)

    if (!fs.existsSync(deploymentPath)) {
        throw new Error(`[FATAL] Ignition deployment file not found for chain ${chainId}. Please deploy first.`)
    }

    const addresses = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"))
    const key = Object.keys(addresses).find(k => k.includes(contractName))

    if (!key) {
        throw new Error(`[FATAL] Address for ${contractName} not found in Ignition state!`)
    }

    return addresses[key]
}

async function main() {
    console.log("=========================================")
    console.log("🚀 [AETHER PAY] INITIATING BUYER FLOW")
    console.log("=========================================\n")

    // 1. Retrieve dynamic deployment and static testnet addresses
    const [, buyer, merchant] = await ethers.getSigners()
    const aetherPayAddress = getIgnitionAddress("AetherPay")
    const USDC_ADDRESS = "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f" // Aave Mock USDC

    // 2. Initialize Ethers.js instances with Typechain
    const aetherPay = await ethers.getContractAt("AetherPay", aetherPayAddress) as unknown as AetherPay
    const usdc = await ethers.getContractAt("IERC20", USDC_ADDRESS) as unknown as IERC20

    const paymentAmount = ethers.parseUnits("100", 6) // 100 USDC
    const orderId = "INV-RWA-2026-001"

    console.log(`[STATE] Aether Pay Engine Address : ${aetherPayAddress}`);
    console.log(`[STATE] Target Merchant Address   : ${merchant.address}`);
    console.log(`[STATE] Order ID                  : ${orderId}\n`);

    // 3. State Check
    // Don't forget to Faucet first for Aave Mock USDC at https://app.aave.com
    const initialBuyerBalance = await usdc.balanceOf(buyer.address)
    console.log(`[STATE] Initial Buyer USDC Balance: ${ethers.formatUnits(initialBuyerBalance, 6)} USDC\n`)

    // 4. Token Approval
    console.log("⏳ 1. Approving Aether Pay to spend Buyer's USDC...")
    const approveTx = await usdc.connect(buyer).approve(aetherPayAddress, paymentAmount)
    await approveTx.wait(1)
    console.log("✅ Approval Successful!\n")

    // 5. Execute Payment
    console.log(`⏳ 2. Executing pay() function... routing funds to Aave V3...`);
    const payTx = await aetherPay.connect(buyer).pay(merchant.address, paymentAmount, orderId)
    await payTx.wait(1)
    console.log("✅ Payment Executed and Funds Supplied to Aave!\n");
    
    // 6. Metrics Collection
    const finalBuyerBalance = await usdc.balanceOf(buyer.address)
    const merchantShares = await aetherPay.s_merchantShares(merchant.address)
    const totalAssets = await aetherPay.totalAssets()

    console.log("==========================================")
    console.log("📊 POST-PAYMENT REPORT")
    console.log("==========================================")
    console.log(`[-] Buyer Balance Decreased   : ${ethers.formatUnits(initialBuyerBalance - finalBuyerBalance, 6)} USDC`)
    console.log(`[+] Merchant Shares Minted    : ${ethers.formatUnits(merchantShares, 6)} Shares`)
    console.log(`[🏦] Total Protocol Assets    : ${ethers.formatUnits(totalAssets, 6)} aUSDC`)
    console.log(`[💰] Final Buyer Balance      : ${ethers.formatUnits(finalBuyerBalance, 6)} USDC`)
    console.log("==========================================\n")
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})