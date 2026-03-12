import { buildModule } from "@nomicfoundation/hardhat-ignition/modules"

const AetherPayModule = buildModule("AetherPayModule", (m) => {
    // 1. PARAMETER INJECTION
    // Aave Mock USDC
    const usdcAddress = m.getParameter("usdcAddress", "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f")

    // aUSDC Base Sepolia (From Aave V3 Pool Base Sepolia)
    const aUsdcAddress = m.getParameter(
        "aUsdcAddress",
        "0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC",
    )

    // Aave V3 Pool Proxy at Base Sepolia
    const aavePoolAddress = m.getParameter(
        "aavePoolAddress",
        "0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27",
    )

    // Treasury company wallet
    const treasuryAddress = m.getParameter(
        "treasuryAddress",
        process.env.TREASURY_ADDRESS || "0x0000000000000000000000000000000000000000",
    )

    // 2. EXECUTION DEPLOYMENT
    const aetherPay = m.contract("AetherPay", [
        usdcAddress,
        aUsdcAddress,
        aavePoolAddress,
        treasuryAddress,
    ])

    // Return instance contract that can read by Ignition
    return { aetherPay }
})

export default AetherPayModule
