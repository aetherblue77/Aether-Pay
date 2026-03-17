// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";

error AetherPay__ZeroAddress();
error AetherPay__InvalidMerchant();
error AetherPay__InvalidTreasury();
error AetherPay__ZeroAmount();
error AetherPay__AmountTooLow();
error AetherPay__InsufficientShares();

/**
 * @title Aether Pay - Auto-Yield Payment Gateway
 * @author Jonathan Evan / Joev
 * @dev Architecture Vault Non-Custodial integrated with Aave V3
 * Optimized with Infinite Approval (Gas Saver) & Clean Storage (No Bloat)
 */
contract AetherPay is ReentrancyGuard, Ownable, Pausable {
    // Make sure Transfer Token not failed
    using SafeERC20 for IERC20;

    // ==========================================
    // 1. INFRASTRUCTURE AAVE & TOKEN (Immutable = Cheap Gas)
    // ==========================================
    IERC20 public immutable i_usdc;
    IERC20 public immutable i_aUsdc;
    IPool public immutable i_aavePool;

    // ==========================================
    // 2. PARAMETER BUSINESS ($1M Engine)
    // ==========================================
    address public s_treasury; // Company Wallet
    uint256 public constant PROTOCOL_FEE_BPS = 3000; // 30% in Basis Points (10,000 = 100%)
    uint256 public constant FEE_DENOMINATOR = 10000; // Single Source of Truth for Fee Calculation
    uint256 public constant MIN_PAYMENT = 100000; // 0.1 USDC (Anti-Dust Spam)

    // ==========================================
    // 3. ACCOUNTANT SYSTEM (System Shares)
    // ==========================================
    mapping(address => uint256) public s_merchantShares;
    mapping(address => uint256) public s_merchantPrincipal; // Principal Money
    uint256 public s_totalShares;

    // ==========================================
    // 4. EVENTS
    // ==========================================
    event PaymentSuccess(
        address indexed merchant,
        address indexed buyer,
        uint256 amount,
        string orderId
    );
    event WithdrawnSuccess(address indexed merchant, uint256 userPayout, uint256 protocolFee);
    event TreasuryUpdated(address oldTreasury, address newTreasury);

    constructor(
        address _usdc,
        address _aUsdc,
        address _aavePool,
        address _treasury
    ) Ownable(msg.sender) {
        if (
            _usdc == address(0) ||
            _aUsdc == address(0) ||
            _aavePool == address(0) ||
            _treasury == address(0)
        ) {
            revert AetherPay__ZeroAddress();
        }
        i_usdc = IERC20(_usdc);
        i_aUsdc = IERC20(_aUsdc);
        i_aavePool = IPool(_aavePool);
        s_treasury = _treasury;

        // THE INFINITE APPROVAL HACK
        // Approve Aave to spend all USDC from this contract
        i_usdc.forceApprove(address(i_aavePool), type(uint256).max);
    }

    /**
     * @dev Core Engine: Withdraw buyer's money, deposit to Aave, mint shares to merchant
     * @param merchant Seller wallet address
     * @param amount Amount USDC
     * @param orderId Order ID from merchant backend (For confirmation delivery)
     */
    function pay(address merchant, uint256 amount, string calldata orderId) external nonReentrant whenNotPaused {
        if (merchant == address(0)) revert AetherPay__InvalidMerchant();
        if (amount < MIN_PAYMENT) revert AetherPay__AmountTooLow(); // Anti-Spam Protection

        // 1. Check & Math: Count all at the first time
        // Count total asset before inflow fund
        uint256 totalAssetsBefore = totalAssets();
        uint256 sharesToMint;

        // Calculate Shares (Ownership Unit)
        if (s_totalShares == 0 || totalAssetsBefore == 0) {
            // If this is a first transaction in protocol, 1 Share = 1 USDC
            sharesToMint = amount;
        } else {
            // If already exist yield in protocol, use precentage rasio
            sharesToMint = (amount * s_totalShares) / totalAssetsBefore;
        }

        // 2. EFFECTS: Update state internal first
        s_merchantShares[merchant] += sharesToMint;
        s_merchantPrincipal[merchant] += amount;
        s_totalShares += sharesToMint;
        
        // 3. INTERACTIONS: Do transfering and interaction with Aave
        // Withdraw fund from buyer wallet into AetherPay contract
        // Make sure buyer already called function "approve()" in frontend before this
        i_usdc.safeTransferFrom(msg.sender, address(this), amount);

        // Deposit (Supply) fund to Aave V3
        // onBehalfOf = address(this) -> AetherPay holds the right to aUSDC, merchants are not
        i_aavePool.supply(address(i_usdc), amount, address(this), 0);


        // 4. Emit event for merchant backend know if the order already paid
        emit PaymentSuccess(merchant, msg.sender, amount, orderId);
    }

    /**
     * @dev Money Printing & Disbursement Machine. Separates principal and yield, then deducts fees.
     * @param sharesToWithdraw amount of Shares want withdrawn by merchant
     */
    function withdraw(uint256 sharesToWithdraw) external nonReentrant whenNotPaused {
        if (sharesToWithdraw == 0) revert AetherPay__ZeroAmount();
        if (s_merchantShares[msg.sender] < sharesToWithdraw) revert AetherPay__InsufficientShares();

        // 1. CHECKS & MATH
        uint256 totalAssetsBefore = totalAssets();

        // Calculation of the total value (principal + yield) of the shares currently withdrawn
        uint256 assetsToWithdraw = (sharesToWithdraw * totalAssetsBefore) / s_totalShares;

        // Calculation of the proportion of Principal Money from the shares
        uint256 principalToWithdraw = (sharesToWithdraw * s_merchantPrincipal[msg.sender]) / s_merchantShares[msg.sender];

        // 2. EFFECTS: Update state internal first
        s_merchantShares[msg.sender] -= sharesToWithdraw;
        s_merchantPrincipal[msg.sender] -= principalToWithdraw;
        s_totalShares -= sharesToWithdraw;

        // 3. INTERACTIONS: Withdraw from Aave and catch the true value to avoid bug decimal rounding
        uint256 actualWithdrawn = i_aavePool.withdraw(address(i_usdc), assetsToWithdraw, address(this)); 

        // 4. Extraction yield and fee 30%
        uint256 yield = 0;
        uint256 fee = 0;

        // Make sure there is no underflow if Aave experiences an anomaly (slash)
        if (actualWithdrawn > principalToWithdraw) {
            yield = actualWithdrawn - principalToWithdraw;
            fee = (yield * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR;
        }

        uint256 userPayout = actualWithdrawn - fee;


        // 5. Distribute funds
        i_usdc.safeTransfer(msg.sender, userPayout);
        if (fee > 0) {
            i_usdc.safeTransfer(s_treasury, fee);
        }

        emit WithdrawnSuccess(msg.sender, userPayout, fee);
    }

    /**
     * @dev Change wallet address of treasury 
     */
    function updateTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert AetherPay__InvalidTreasury();
        address oldTreasury = s_treasury;
        s_treasury = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    /**
     * @dev Emergency Button (Circuit Breaker) if Aave is in chaos
     */
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ==========================================
    // VIEW FUNCTIONS (For On-chain / Specific Queries)
    // ==========================================
    function totalAssets() public view returns (uint256) {
        return i_aUsdc.balanceOf(address(this));
    }

    function getMerchantBalance(address merchant) external view returns (uint256) {
        if (s_totalShares == 0) return 0;
        uint256 totalAsset = totalAssets();
        return (s_merchantShares[merchant] * totalAsset) / s_totalShares;
    }

    function getMerchantPendingYield(address merchant) external view returns (uint256) {
        if (s_totalShares == 0) return 0;
        uint256 totalAsset = totalAssets();
        uint256 currentValue = (s_merchantShares[merchant] * totalAsset) / s_totalShares;
        uint256 principal = s_merchantPrincipal[merchant];

        if (currentValue > principal) {
            return currentValue - principal;
        }

        return 0;
    }

    function previewWithdrawal(address merchant, uint256 sharesToWithdraw) external view returns (
        uint256 merchantPayout,
        uint256 protocolFee,
        uint256 yieldEarned
    ) {
        if (sharesToWithdraw == 0 || s_totalShares == 0 || s_merchantShares[merchant] == 0) {
            return (0, 0, 0);
        }

        uint256 totalAsset = totalAssets();
        uint256 assetsToWithdraw = (sharesToWithdraw * totalAsset) / s_totalShares;
        uint256 principalToWithdraw = (sharesToWithdraw * s_merchantPrincipal[merchant]) / s_merchantShares[merchant];

        if (assetsToWithdraw > principalToWithdraw) {
            yieldEarned = assetsToWithdraw - principalToWithdraw;
            protocolFee = (yieldEarned * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR;
        }

        merchantPayout = assetsToWithdraw - protocolFee;
    }


    // ==========================================
    // VIEW FUNCTIONS (AGGREGATOR - For Frontend Dashboard Load)
    // ==========================================

    struct MerchantDashboard {
        uint256 totalShares;
        uint256 totalPrincipal;
        uint256 currentBalance;
        uint256 grossYield;
        uint256 netYield;
    }

    /**
     * @dev One-click data fetcher for Frontend Dashboard
     */
    function getMerchantDashboardData(address merchant) external view returns (MerchantDashboard memory) {
        if (s_merchantShares[merchant] == 0) {
            return MerchantDashboard(0, 0, 0, 0, 0);
        }

        uint256 shares = s_merchantShares[merchant];
        uint256 principal = s_merchantPrincipal[merchant];

        uint256 totalAsset = totalAssets();
        uint256 currentBalance = (shares * totalAsset) / s_totalShares;

        uint256 grossYield = 0;
        uint256 netYield = 0;

        if (currentBalance > principal) {
            grossYield = currentBalance - principal;
            uint256 fee = (grossYield * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR;
            netYield = grossYield - fee;
        }

        return MerchantDashboard(shares, principal, currentBalance, grossYield, netYield);
    }
}
