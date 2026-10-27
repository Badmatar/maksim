import 'dotenv/config';
import { scheduleMaintenance } from '../lib/automations';
import { runWorker } from '../lib/worker';
import { db } from '../lib/db';
async function main(){await scheduleMaintenance();console.log(await runWorker(100));}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.$disconnect());
