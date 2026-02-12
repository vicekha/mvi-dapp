import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const deploymentOutputLocal = path.join(__dirname, 'contracts/deployment_output.txt');
const deploymentOutputSepolia = path.join(__dirname, 'contracts/deployment_sepolia.txt');
const deploymentOutputLasna = path.join(__dirname, 'contracts/deployment_lasna.txt');
const frontendConfig = path.join(__dirname, 'frontend/src/config/contracts.ts');

function parseDeployment(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8');
    return {
        WALLET_SWAP_MAIN: content.match(/WalletSwapMain[^\n]*?(0x[a-fA-F0-9]{40})/)?.[1],
        ORDER_PROCESSOR: content.match(/OrderProcessor[^\n]*?(0x[a-fA-F0-9]{40})/)?.[1],
        FEE_DISTRIBUTOR: content.match(/FeeDistributor[^\n]*?(0x[a-fA-F0-9]{40})/)?.[1],
        ASSET_VERIFIER: content.match(/AssetVerifier[^\n]*?(0x[a-fA-F0-9]{40})/)?.[1],
    };
}

let configContent = fs.readFileSync(frontendConfig, 'utf-8');

// Update function
function updateConfig(chainId, addresses, name) {
    if (!addresses || !addresses.WALLET_SWAP_MAIN) {
        console.log(`No deployment addresses found for ${name}.`);
        return;
    }
    console.log(`Updating ${name}...`, addresses);
    const regex = new RegExp(`(${chainId}: \\{[\\s\\S]*?\\})`, 'g');
    const match = regex.exec(configContent);

    if (match) {
        const newBlock = `${chainId}: {
        WALLET_SWAP_MAIN: '${addresses.WALLET_SWAP_MAIN}',
        ORDER_PROCESSOR: '${addresses.ORDER_PROCESSOR}',
        FEE_DISTRIBUTOR: '${addresses.FEE_DISTRIBUTOR}',
        ASSET_VERIFIER: '${addresses.ASSET_VERIFIER}',
    }`;
        configContent = configContent.replace(match[0], newBlock);
    }
}

// Update Local
updateConfig(31337, parseDeployment(deploymentOutputLocal), 'Anvil');

// Update Sepolia
updateConfig(11155111, parseDeployment(deploymentOutputSepolia), 'Sepolia');

// Update Lasna
updateConfig(5318007, parseDeployment(deploymentOutputLasna), 'Lasna');

fs.writeFileSync(frontendConfig, configContent);
console.log('Frontend config updated.');
