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
        it("Revert if amount is lower than min payment or merchant address 0", async function () {
            const { aetherPay, buyer } = await loadFixture(deployAetherPayFixture)
            await expect(
                aetherPay.connect(buyer).pay(ethers.Wallet.createRandom().address, 0, "ORD-1"),
            ).to.be.revertedWithCustomError(aetherPay, "AetherPay__AmountTooLow")
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

    describe("View Functions (For On-chain / Specific Queries)", function () {
        it("Return 0 values when protocol is empty (Empty State)", async function () {
            const {aetherPay, merchant} = await loadFixture(deployAetherPayFixture)

            expect(await aetherPay.getMerchantBalance(merchant.address)).to.equal(0)
            expect(await aetherPay.getMerchantPendingYield(merchant.address)).to.equal(0)

            const [payout, fee, yieldEarned] = await aetherPay.previewWithdrawal(merchant.address, 100n)
            expect(payout).to.equal(0)
            expect(fee).to.equal(0)
            expect(yieldEarned).to.equal(0)
        })

        it("Return 0 pending yield if currentValue isn't greater than principal", async function () {
            const {aetherPay, usdc, merchant, buyer} = await loadFixture(deployAetherPayFixture)

            await usdc.connect(buyer).approve(await aetherPay.getAddress(), PAYMENT_AMOUNT)
            await aetherPay.connect(buyer).pay(merchant.address, PAYMENT_AMOUNT, "ORD-002")

            const pendingYield = await aetherPay.getMerchantPendingYield(merchant.address)

            expect(pendingYield).to.equal(0)

            const shares = await aetherPay.s_merchantShares(merchant.address)
            const [payout, fee, yieldEarned] = await aetherPay.previewWithdrawal(merchant.address, shares)
            
            expect(yieldEarned).to.equal(0)
            expect(fee).to.equal(0)
            expect(payout).to.closeTo(PAYMENT_AMOUNT, 10n)
        })

        it("Return 0 values if merchant previews withdrawal of 0 shares", async function () {
            const {aetherPay, usdc, merchant, buyer} = await loadFixture(deployAetherPayFixture)

            await usdc.connect(buyer).approve(await aetherPay.getAddress(), PAYMENT_AMOUNT)
            await aetherPay.connect(buyer).pay(merchant.address, PAYMENT_AMOUNT, "ORD-003")
            const [payout, fee, yieldEarned] = await aetherPay.previewWithdrawal(merchant.address, 0n)

            expect(payout).to.equal(0)
            expect(fee).to.equal(0)
            expect(yieldEarned).to.equal(0)
        })

        it("Return 0 values if bystander merchant has 0 shares but protocol has active TVL", async function () {
            const {aetherPay, usdc, merchant, buyer} = await loadFixture(deployAetherPayFixture)
            const bystanderMerchant = ethers.Wallet.createRandom().address

            await usdc.connect(buyer).approve(await aetherPay.getAddress(), PAYMENT_AMOUNT)
            await aetherPay.connect(buyer).pay(merchant.address, PAYMENT_AMOUNT, "ORD-005")

            const [payout, fee, yieldEarned] = await aetherPay.previewWithdrawal(bystanderMerchant, 100n)

            expect(payout).to.equal(0)
            expect(fee).to.equal(0)
            expect(yieldEarned).to.equal(0)
        })

        it("Return exact principal values immediately after payment (Zero Yield)", async function () {
            const {aetherPay, usdc, merchant, buyer} = await loadFixture(deployAetherPayFixture)

            await usdc.connect(buyer).approve(await aetherPay.getAddress(),PAYMENT_AMOUNT)
            await aetherPay.connect(buyer).pay(merchant.address, PAYMENT_AMOUNT, "ORD-001")

            expect(await aetherPay.getMerchantBalance(merchant.address)).to.closeTo(PAYMENT_AMOUNT, 10n)

            const shares = await aetherPay.s_merchantShares(merchant.address)
            const [payout, fee, yieldEarned] = await aetherPay.previewWithdrawal(merchant.address, shares)

            expect(payout).to.closeTo(PAYMENT_AMOUNT, 10n)
            expect(fee).to.equal(0)
            expect(yieldEarned).to.equal(0)
        })

        it("Return correct yield and fee calculations after time travel", async function () {
            const {aetherPay, usdc, merchant, buyer} = await loadFixture(deployAetherPayFixture)

            await usdc.connect(buyer).approve(await aetherPay.getAddress(), PAYMENT_AMOUNT)
            await aetherPay.connect(buyer).pay(merchant.address, PAYMENT_AMOUNT, "ORD-004")

            // Time Travel 1 Year to return yield
            await time.increase(365 * 24 * 60 * 60)
            
            const currentBalance = await aetherPay.getMerchantBalance(merchant.address)
            const pendingYield = await aetherPay.getMerchantPendingYield(merchant.address)

            expect(currentBalance).to.be.greaterThan(PAYMENT_AMOUNT)
            expect(pendingYield).to.be.greaterThan(0)
            expect(currentBalance - PAYMENT_AMOUNT).to.equal(pendingYield)

            const shares = await aetherPay.s_merchantShares(merchant.address)
            const [payout,fee, yieldEarned] = await aetherPay.previewWithdrawal(merchant.address, shares)

            expect(yieldEarned).to.equal(pendingYield)
            expect(fee).to.be.greaterThan(0)

            const expectedPayout = currentBalance - fee
            expect(payout).to.equal(expectedPayout)
        })
    })

    describe("Aggregator View Function (Dasboard Data)", function () {
        it("Return all zeros if merchant has no shares (Empty State)", async function () {
            const {aetherPay, merchant} = await loadFixture(deployAetherPayFixture)
            const dashboardData = await aetherPay.getMerchantDashboardData(merchant.address)
            
            expect(dashboardData.totalShares).to.equal(0)
            expect(dashboardData.totalPrincipal).to.equal(0)
            expect(dashboardData.currentBalance).to.equal(0)
            expect(dashboardData.grossYield).to.equal(0)
            expect(dashboardData.netYield).to.equal(0)
        })

        it("Return correct aggregated data immediately after payment (Zero Yield)", async function () {
            const {aetherPay, usdc, merchant, buyer} = await loadFixture(deployAetherPayFixture)

            await usdc.connect(buyer).approve(await aetherPay.getAddress(), PAYMENT_AMOUNT)
            await aetherPay.connect(buyer).pay(merchant.address, PAYMENT_AMOUNT, "ORD-DASH-1")

            const dashboardData = await aetherPay.getMerchantDashboardData(merchant.address)
            
            expect(dashboardData.totalPrincipal).to.equal(PAYMENT_AMOUNT)
            expect(dashboardData.currentBalance).to.closeTo(PAYMENT_AMOUNT, 10n)
            expect(dashboardData.grossYield).to.equal(0)
            expect(dashboardData.netYield).to.equal(0)
        })

        it("Return correct gross and net yield calculations after time travel", async function () {
            const {aetherPay, usdc, merchant, buyer} = await loadFixture(deployAetherPayFixture)

            await usdc.connect(buyer).approve(await aetherPay.getAddress(), PAYMENT_AMOUNT)
            await aetherPay.connect(buyer).pay(merchant.address, PAYMENT_AMOUNT, "ORD-DASH-2")

            // Time Travel 1 Year
            await time.increase(365 * 24 * 60 * 60)

            const dashboardData = await aetherPay.getMerchantDashboardData(merchant.address)

            // Balance must be greater thant principal
            expect(dashboardData.currentBalance).to.be.greaterThan(PAYMENT_AMOUNT)

            // Gross yield must be positive
            expect(dashboardData.grossYield).to.be.greaterThan(0)

            // Gross Yield = CurrentBalance - Principal
            expect(dashboardData.grossYield).to.equal(dashboardData.currentBalance - dashboardData.totalPrincipal)

            // Net yield must be less than gross yield
            expect(dashboardData.netYield).to.be.lessThan(dashboardData.grossYield)
            expect(dashboardData.netYield).to.be.greaterThan(0)
            
            // Make sure count of fee 30% accurately
            const expectedFee = (dashboardData.grossYield * 3000n) / 10000n
            expect(dashboardData.netYield).to.equal(dashboardData.grossYield - expectedFee)
        })
    })
})
