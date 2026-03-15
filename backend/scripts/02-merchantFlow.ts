import {ethers, network} from "hardhat"
import * as fs from "fs"
import * as path from "path"
import type { AetherPay, IERC20 } from "../typechain-types"

function getIgnitionAddress(contractName: string): string {
    const chainId = network.config.chainId
    const deploymentPath = path.join(__dirname, `../ignition/deployments/chain-${chainId}/deployed_addresses.json`)

    if (!fs.existsSync(deploymentPath)) {
        throw new Error(`Ignition deployment file not found for chain ${chainId}. Please deploy first.`)
    }

    const addresses = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"))
    const key = Object.keys(addresses).find(k => k.includes(contractName))

    if (!key) throw new Error(`Address for ${contractName} not found in Ignition state!`)

    return addresses[key]
}

async function main() {
    console.log("=================================================")
    console.log("🏦 [AETHER PAY] INITIATING MERCHANT WITHDRAWAL")
    console.log("=================================================\n")

    // Index 0: Admin/Deployer, Index 1: Buyer (Ignore), Index 2: Merchant
    const [, , merchant] = await ethers.getSigners()

    // 1. Retrieve dynamic deployment and static testnet addresses
    const aetherPayAddress = getIgnitionAddress("AetherPay")
    const USDC_ADDRESS = "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f" // Aave Mock USDC

    // 2. Initialize Ethers.js instances with Typechain
    const aetherPay = await ethers.getContractAt("AetherPay", aetherPayAddress) as unknown as AetherPay
    const usdc = await ethers.getContractAt("IERC20", USDC_ADDRESS) as unknown as IERC20

    console.log(`[STATE] Aether Pay Engine Address : ${aetherPayAddress}`)
    console.log(`[STATE] Target Merchant Address   : ${merchant.address}`)

    const treasuryAddress = await aetherPay.s_treasury()
    console.log(`[STATE] Treasury Wallet           : ${treasuryAddress}\n`)

    // 3. State Check
    const merchantShares = await aetherPay.s_merchantShares(merchant.address)

    if (merchantShares === 0n) {
        console.log("❌ [ABORT] Merchant has 0 shares. Please run the Buyer Flow script first.")
        return
    }

    const initialMerchantBalance = await usdc.balanceOf(merchant.address)
    const initialTreasuryBalance = await usdc.balanceOf(treasuryAddress)

    console.log(`[STATE] Available Merchant Shares : ${ethers.formatUnits(merchantShares, 6)} Shares`)
    console.log(`[STATE] Initial Merchant Balance  : ${ethers.formatUnits(initialMerchantBalance, 6)} USDC`)
    console.log(`[STATE] Initial Treasury Balance  : ${ethers.formatUnits(initialTreasuryBalance, 6)} USDC\n`)

    console.log("⏳ 1. Executing withdrawal from Aave V3 Liquidity Pool...")
    // 4. Execute Withdrawal
    const withdrawTx = await aetherPay.connect(merchant).withdraw(merchantShares)
    const receipt = await withdrawTx.wait(1)

    let userPayout = 0n
    let protocolFee = 0n

    for (const log of receipt!.logs) {
        try {
            const parsedLog = aetherPay.interface.parseLog(log as any)
            if (parsedLog?.name === "WithdrawnSuccess") {
                userPayout = parsedLog.args[1]
                protocolFee = parsedLog.args[2]
            }
        } catch (e) {
            // Ignore event from Aave and USDC
        }
    }

    console.log("✅ Withdrawal Successful! Yield extracted and distributed.\n")

    const finalMerchantBalance = await usdc.balanceOf(merchant.address)
    const finalTreasuryBalance = await usdc.balanceOf(treasuryAddress)
    const remainingProtocolAssets = await aetherPay.totalAssets()

    console.log("==========================================")
    console.log("💸 REVENUE & PAYOUT LEDGER (POST-WITHDRAWAL)")
    console.log("==========================================")
    console.log(`[+] Total Distributed to Merchant (Principal + Yield) : ${ethers.formatUnits(userPayout, 6)} USDC`)
    console.log(`[💰] TREASURY REVENUE (30% Yield Fee)                 : ${ethers.formatUnits(protocolFee, 6)} USDC`)
    console.log("------------------------------------------")
    console.log(`[💰] Merchant USDC Balance Now : ${ethers.formatUnits(finalMerchantBalance, 6)} USDC`)
    console.log(`[💰] Treasury USDC Balance Now : ${ethers.formatUnits(finalTreasuryBalance, 6)} USDC`)
    console.log(`[🏦] Protocol Remaining Assets     : ${ethers.formatUnits(remainingProtocolAssets, 6)} aUSDC`)
    console.log("==========================================\n")
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})