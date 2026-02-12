import { ethers } from "ethers";
import * as fs from "fs";

const signature = "OrderInitiated(bytes32,address,address,address,uint8,uint8,uint256,uint256,uint256)";
const hash = ethers.id(signature);

fs.writeFileSync("topic_hash.txt", hash);
console.log("Written to topic_hash.txt");
