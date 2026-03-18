import * as fs from "fs"
import * as path from "path"
import { artifacts, network } from "hardhat"

const FRONTEND_CONSTANTS_DIR = path.join(__dirname, "../../frontend/src/constants")
const FRONTEND_ADDRESSES_FILE = path.join(FRONTEND_CONSTANTS_DIR, "contractAddresses.json")

async function main() {
    console.log("🔄 Starting The Automator: Synchronizing Backend to Frontend...")

    // 1. Ensure frontend constants directory exists
    if (!fs.existsSync(FRONTEND_CONSTANTS_DIR)) {
        console.log(`📁 Creating new directory at: ${FRONTEND_CONSTANTS_DIR}`)
        fs.mkdirSync(FRONTEND_CONSTANTS_DIR, {recursive: true})
    }

    // 2. Fetch current Chain ID from Hardhat Network Config
    const chainId = network.config.chainId?.toString()
    if (!chainId) throw new Error("❌ Chain ID not found in network configuration!")

    // 3. Locate Ignition deployment logs dynamically
    const ignitionDeploymentsPath = path.join(__dirname, `../ignition/deployments/chain-${chainId}/deployed_addresses.json`)

    if (!fs.existsSync(ignitionDeploymentsPath)) {
        console.error(`❌ Ignition deployment file not found for chain ${chainId}.`)
        return
    }

    const ignitionData = JSON.parse(fs.readFileSync(ignitionDeploymentsPath, "utf-8"))

    // 4. Load existing addresses from Frontend (if any)
    // New Format: { "84532": { "AetherPay": ["0x..."], "AnotherContract": ["0x..."] } }
    let currentAddresses: Record<string, Record<string, string[]>> = {}
    if (fs.existsSync(FRONTEND_ADDRESSES_FILE)) {
        currentAddresses = JSON.parse(fs.readFileSync(FRONTEND_ADDRESSES_FILE, "utf-8"))
    }

    if (!currentAddresses[chainId]) {
        currentAddresses[chainId] = {}
    }

    // 5. DYNAMIC ITERATION: Loop through all deployed contracts in Ignition
    for (const [ignitionKey, address] of Object.entries(ignitionData)) {
        // ignitionKey format: "ModuleName#ContractName" (e.g., "AetherPayModule#AetherPay")
        // We split it by "#" and take the second part to get the pure contract name
        const contractName = ignitionKey.includes("#") ? ignitionKey.split("#")[1] : ignitionKey

        // Update Addresses
        currentAddresses[chainId][contractName] = [address as string]
        console.log(`✅ Address updated: ${contractName} -> ${address}`)

        // 6. DYNAMIC ABI EXTRACTION: Extract ABI for each specific contract
        try {
            const contractArtifact = await artifacts.readArtifact(contractName)
            // Save ABI specifically with its contract name, e.g., "AetherPayAbi.json"
            const abiFilePath = path.join(FRONTEND_CONSTANTS_DIR, `${contractName}Abi.json`)
            fs.writeFileSync(abiFilePath, JSON.stringify(contractArtifact.abi, null, 2))
            console.log(`✅ ABI extracted: ${contractName}Abi.json`)
        } catch (error) {
            console.warn(`⚠️ Could not find Artifact for ${contractName}. Skipping ABI sync.`)
        }
    }

    // 7. Write the master address file
    fs.writeFileSync(FRONTEND_ADDRESSES_FILE, JSON.stringify(currentAddresses, null, 2))

    console.log("🚀 Multi-Contract Synchronization Complete!")
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})