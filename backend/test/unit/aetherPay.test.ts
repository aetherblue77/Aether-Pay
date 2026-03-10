import { expect } from "chai"
import { ethers } from "hardhat"
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
    async function deployAetherPayFixture() {
        const [owner, treasury, merchant, buyer, hacker] = await ethers.getSigners()

        const usdc = await ethers.getContractAt("IERC20", USDC_ADDRESS)
        const aUsdc = await ethers.getContractAt("IERC20", AUSDC_ADDRESS)

        // Simulation: Get fund from whale
        await impersonateAccount(WHALE_ADDRESS)
        const whale = await ethers.getSigner(WHALE_ADDRESS)
        await setBalance(WHALE_ADDRESS, ethers.parseEther("1"))
        await usdc.connect(whale).transfer(buyer.address, PAYMENT_AMOUNT * 10n)

        // Deploy contract
        const aetherPayFactory = await ethers.getContractFactory("AetherPay")
        const aetherPay = await aetherPayFactory.deploy(
            USDC_ADDRESS,
            AUSDC_ADDRESS,
            AAVE_POOL_ADDRESS,
            treasury.address,
        )

        return { aetherPay, usdc, aUsdc, owner, treasury, merchant, buyer, hacker, whale }
    }

    describe("Deployment & Initialization Constructor", function () {
        it("Revert if usdc address is 0 (zero address)", async function () {
            const aetherPayFactory = await ethers.getContractFactory("AetherPay")
            await expect(
                aetherPayFactory.deploy(
                    ethers.ZeroAddress,
                    AUSDC_ADDRESS,
                    AAVE_POOL_ADDRESS,
                    ethers.Wallet.createRandom().address,
                ),
            ).to.be.revertedWithCustomError(aetherPayFactory, "AetherPay__ZeroAddress")
        })

        it("Revert if aUsdc address is 0 (zero address)", async function () {
            const aetherPayFactory = await ethers.getContractFactory("AetherPay")
            await expect(
                aetherPayFactory.deploy(
                    USDC_ADDRESS,
                    ethers.ZeroAddress,
                    AAVE_POOL_ADDRESS,
                    ethers.Wallet.createRandom().address,
                ),
            ).to.be.revertedWithCustomError(aetherPayFactory, "AetherPay__ZeroAddress")
        })

        it("Revert if Aave pool address is 0 (zero address)", async function () {
            const aetherPayFactory = await ethers.getContractFactory("AetherPay")
            await expect(
                aetherPayFactory.deploy(
                    USDC_ADDRESS,
                    AUSDC_ADDRESS,
                    ethers.ZeroAddress,
                    ethers.Wallet.createRandom().address,
                ),
            ).to.be.revertedWithCustomError(aetherPayFactory, "AetherPay__ZeroAddress")
        })

        it("Revert if treasury address is 0 (zero address)", async function () {
            const aetherPayFactory = await ethers.getContractFactory("AetherPay")
            await expect(
                aetherPayFactory.deploy(
                    USDC_ADDRESS,
                    AUSDC_ADDRESS,
                    AAVE_POOL_ADDRESS,
                    ethers.ZeroAddress,
                ),
            ).to.be.revertedWithCustomError(aetherPayFactory, "AetherPay__ZeroAddress")
        })
    })

    describe("Pay Function", function () {
        it("Revert if amount 0 or merchant address 0", async function () {
            const { aetherPay, buyer } = await loadFixture(deployAetherPayFixture)
            await expect(
                aetherPay.connect(buyer).pay(ethers.Wallet.createRandom().address, 0, "ORD-1"),
            ).to.be.revertedWithCustomError(aetherPay, "AetherPay__ZeroAmount")
            await expect(
                aetherPay.connect(buyer).pay(ethers.ZeroAddress, PAYMENT_AMOUNT, "ORD-1"),
            ).to.be.revertedWithCustomError(aetherPay, "AetherPay__InvalidMerchant")
        })

        it("Emit event if payment success", async function () {
            const { aetherPay, usdc, merchant, buyer } = await loadFixture(deployAetherPayFixture)
            await usdc.connect(buyer).approve(await aetherPay.getAddress(), PAYMENT_AMOUNT)
            await expect(aetherPay.connect(buyer).pay(merchant.address, PAYMENT_AMOUNT, "ORD-777"))
                .to.emit(aetherPay, "PaymentSuccess")
                .withArgs(merchant.address, buyer.address, PAYMENT_AMOUNT, "ORD-777")
        })

        it("Calculating the Shares ratio correctly on the second deposit (Multiple Inflow)", async function () {
            const { aetherPay, usdc, merchant, buyer } = await loadFixture(deployAetherPayFixture)
            const secondMerchant = ethers.Wallet.createRandom().address

            // 1. First Deposit (triggered: s_totalShares = 0)
            await usdc.connect(buyer).approve(await aetherPay.getAddress(), PAYMENT_AMOUNT)
            await aetherPay.connect(buyer).pay(merchant.address, PAYMENT_AMOUNT, "ORD-001")

            // 2. Second Deposit from same user to different merchant
            await usdc.connect(buyer).approve(await aetherPay.getAddress(), PAYMENT_AMOUNT)
            await aetherPay.connect(buyer).pay(secondMerchant, PAYMENT_AMOUNT, "ORD-002")

            // Validate: Second Merchant must get proportional shares
            const secondShareMerchant = await aetherPay.s_merchantShares(secondMerchant)
            expect(secondShareMerchant).to.be.greaterThan(0)
        })
    })

    describe("Withdraw Function", async function () {
        it("Revert if merchant withdraw 0 shares or exceeds the balance", async function () {
            const { aetherPay, merchant, usdc, buyer } = await loadFixture(deployAetherPayFixture)
            await usdc.connect(buyer).approve(await aetherPay.getAddress(), PAYMENT_AMOUNT)
            await aetherPay.connect(buyer).pay(merchant.address, PAYMENT_AMOUNT, "ORD-1")
            await expect(aetherPay.connect(merchant).withdraw(0)).to.be.revertedWithCustomError(
                aetherPay,
                "AetherPay__ZeroAmount",
            )
            await expect(
                aetherPay.connect(merchant).withdraw(ethers.parseUnits("1001", 6)),
            ).to.be.revertedWithCustomError(aetherPay, "AetherPay__InsufficientShares")
        })

        it("Partial withdraw & fee extraction", async function () {
            const { aetherPay, usdc, treasury, merchant, buyer } =
                await loadFixture(deployAetherPayFixture)

            // 1. Buyer pay 1000 USDC
            await usdc.connect(buyer).approve(await aetherPay.getAddress(), PAYMENT_AMOUNT)
            await aetherPay.connect(buyer).pay(merchant.address, PAYMENT_AMOUNT, "ORD-123")

            // 2. Time travel: 1 year (return yield)
            await time.increase(365 * 24 * 60 * 60)

            // 3. Merchant only withdraw half (50%) of the shares
            const totalShares = await aetherPay.s_merchantShares(merchant.address)
            const halfShares = totalShares / 2n

            const merchantBalanceBefore = await usdc.balanceOf(merchant.address)
            const treasuryBalanceBefore = await usdc.balanceOf(treasury.address)

            // Make sure WithdrawnSuccess event emit
            await aetherPay.connect(merchant).withdraw(halfShares)
            const merchantBalanceAfter = await usdc.balanceOf(merchant.address)
            const treasuryBalanceAfter = await usdc.balanceOf(treasury.address)

            const merchantReceived = merchantBalanceAfter - merchantBalanceBefore
            const treasuryReceived = treasuryBalanceAfter - treasuryBalanceBefore

            // Merchant receive more than 500 USDC certainly
            expect(merchantReceived).to.be.greaterThan(PAYMENT_AMOUNT / 2n)
            // Treasury get fee certainly
            expect(treasuryReceived).to.be.greaterThan(0)

            // The remaining principal in system must be exactly half remaining
            expect(await aetherPay.s_merchantPrincipal(merchant.address)).to.equal(
                PAYMENT_AMOUNT / 2n,
            )
            expect(await aetherPay.s_merchantShares(merchant.address)).to.equal(halfShares)
        })

        it("Instant withdraw (zero yield & zero address scenario)", async function () {
            const { aetherPay, usdc, treasury, merchant, buyer } =
                await loadFixture(deployAetherPayFixture)
            // 1. Buyer pay 1000 USDC to merchant
            await usdc.connect(buyer).approve(await aetherPay.getAddress(), PAYMENT_AMOUNT)
            await aetherPay.connect(buyer).pay(merchant.address, PAYMENT_AMOUNT, "ORD-INSTANT")

            const totalShares = await aetherPay.s_merchantShares(merchant.address)
            const treasuryBalanceBefore = await usdc.balanceOf(treasury.address)

            // 2. Merchant withdraw directly without wait yield (Zero Yield)
            await aetherPay.connect(merchant).withdraw(totalShares)
            const treasuryBalanceAfter = await usdc.balanceOf(treasury.address)

            // Validate: Fee must exactly 0 because nothing yield
            expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(0)

            // Remaining principal must be exactly 0
            expect(await aetherPay.s_merchantPrincipal(merchant.address)).to.equal(0)
        })
    })

    describe("Internal Security (Admin & Pausable)", function () {
        it("Revert if non-owner change treasury address", async function () {
            const { aetherPay, hacker } = await loadFixture(deployAetherPayFixture)
            const newTreasury = ethers.Wallet.createRandom().address
            await expect(
                aetherPay.connect(hacker).updateTreasury(newTreasury),
            ).to.be.revertedWithCustomError(aetherPay, "OwnableUnauthorizedAccount")
        })

        it("Revert if owner change treasury address to zero address", async function () {
            const { aetherPay, owner } = await loadFixture(deployAetherPayFixture)
            await expect(
                aetherPay.connect(owner).updateTreasury(ethers.ZeroAddress),
            ).to.be.revertedWithCustomError(aetherPay, "AetherPay__InvalidTreasury")
        })

        it("Success if owner change treasury address but no zero address", async function () {
            const { aetherPay, owner, treasury } = await loadFixture(deployAetherPayFixture)
            const newTreasury = ethers.Wallet.createRandom().address
            await expect(aetherPay.connect(owner).updateTreasury(newTreasury))
                .to.emit(aetherPay, "TreasuryUpdated")
                .withArgs(treasury.address, newTreasury)
        })

        it("Revert if non-owner try to pause & unpause", async function () {
            const { aetherPay, owner, hacker } = await loadFixture(deployAetherPayFixture)
            await expect(aetherPay.connect(hacker).pause()).to.be.revertedWithCustomError(
                aetherPay,
                "OwnableUnauthorizedAccount",
            )
            await expect(aetherPay.connect(hacker).unpause()).to.be.revertedWithCustomError(
                aetherPay,
                "OwnableUnauthorizedAccount",
            )
        })

        it("Emergency button must lock Pay & Withdraw function", async function () {
            const { aetherPay, owner, buyer, merchant, usdc } =
                await loadFixture(deployAetherPayFixture)

            // Activate Pausable
            await aetherPay.connect(owner).pause()

            // Try to pay but fail
            await usdc.connect(buyer).approve(await aetherPay.getAddress(), PAYMENT_AMOUNT)
            await expect(
                aetherPay.connect(buyer).pay(merchant.address, PAYMENT_AMOUNT, "ORD-999"),
            ).to.be.revertedWithCustomError(aetherPay, "EnforcedPause")

            // Try to withdraw but fail
            const merchantShares = await aetherPay.s_merchantShares(merchant.address)
            await expect(
                aetherPay.connect(merchant).withdraw(merchantShares),
            ).to.be.revertedWithCustomError(aetherPay, "EnforcedPause")

            // Unpause and function back to normal
            await aetherPay.connect(owner).unpause()
            await expect(aetherPay.connect(buyer).pay(merchant.address, PAYMENT_AMOUNT, "ORD-999"))
                .to.not.be.reverted
        })
    })
})
