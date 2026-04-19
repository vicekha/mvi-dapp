/**
 * Fetch full tx details for the 4 most recent Planbok txs.
 */
import 'dotenv/config';
import { getTransaction } from './planbok-client.js';

const IDS = [
  '69e2e3a34a8ad620582b4d31',
  '69e2e3a05ce8b1f5e4db53b6',
  '69e2e39fe77599d12336b5d7',
  '69e2e39c4a8ad620582b4d27',
];

for (const id of IDS) {
  try {
    const t = await getTransaction(id);
    console.log(`\n--- ${id} ---`);
    console.log(JSON.stringify(t, null, 2));
  } catch (err) {
    console.log(`\n--- ${id} ---  ERROR ${err.message}`);
  }
}
