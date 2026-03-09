import { expect } from "chai"
import { ethers, network } from "hardhat"
import {
    time,
    impersonateAccount,
    setBalance,
    loadFixture,
} from "@nomicfoundation/hardhat-network-helpers"

describe("Aether Pay - Mainnet Forking", function () {
    // ORIGINAL ADDRESS IN BASE MAINNET NETWORK
    const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    const AUSDC_ADDRESS = "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB"
    const AAVE_POOL_ADDRESS = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5"
    const WHALE_ADDRESS = "0x8da91A6298eA5d1A8Bc985e99798fd0A0f05701a"

    const PAYMENT_AMOUNT = ethers.parseUnits("1000", 6)

    // 1. DEFINE FIXTURE
    async function deployAetherPayFunction() {
        const [owner, treasury, merchant, buyer] = await ethers.getSigners()

        const usdc = await ethers.getContractAt("IERC20", USDC_ADDRESS)
        const aUsdc = await ethers.getContractAt("IERC20", AUSDC_ADDRESS)

        // Simulation: Get fund from whale
        await impersonateAccount(WHALE_ADDRESS)
        const whale = await ethers.getSigner(WHALE_ADDRESS)
        await setBalance(WHALE_ADDRESS, ethers.parseEther("1"))
        await usdc.connect(whale).transfer(buyer.address, PAYMENT_AMOUNT)

        // Deploy contract
        const aetherPayFactory = await ethers.getContractFactory("AetherPay")
        const aetherPay = await aetherPayFactory.deploy(USDC_ADDRESS, AUSDC_ADDRESS, AAVE_POOL_ADDRESS, treasury.address)

        return {aetherPay, usdc, aUsdc, owner, treasury, merchant, buyer, whale}
    }

    // 2. 
})
