
import fs from "fs";
const content = fs.readFileSync("../contracts/abi_utf8.json", "utf8").replace(/^\uFEFF/, '');
const abi = JSON.parse(content);

const event = abi.find(x => x.type === "event" && x.name === "OrderInitiated");
if (event) {
    console.log("Found Event:");
    console.log(JSON.stringify(event.inputs, null, 2));

    // Construct signature
    const types = event.inputs.map(i => i.type).join(",");
    console.log(`Signature: OrderInitiated(${types})`);

    // Calculate hash
    const ethers = await import("ethers");
    const sig = `OrderInitiated(${types})`;
    const hash = ethers.keccak256(ethers.toUtf8Bytes(sig));
    console.log(`Calculated Hash: ${hash}`);
} else {
    console.log("Event not found");
}
