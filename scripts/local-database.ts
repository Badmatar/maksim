// Local-only bootstrap from the checked-in Prisma SQL migration.
// Production must use `npm run db:deploy` with a verified Prisma schema engine.
import 'dotenv/config';
import { Client } from 'pg';
import { readFile } from 'node:fs/promises';
async function main(){
 const url=process.env.DATABASE_URL;if(!url)throw new Error('DATABASE_URL missing');const parsed=new URL(url);
 if(!['localhost','127.0.0.1'].includes(parsed.hostname))throw new Error('This helper only supports a local disposable development database');
 const client=new Client({connectionString:url});await client.connect();
 try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(945713)');
 const exists=await client.query(`SELECT to_regclass('public."User"') AS name`);
 if(!exists.rows[0].name)await client.query(await readFile(new URL('../prisma/migrations/20261026090000_initial/migration.sql',import.meta.url),'utf8'));
 await client.query('COMMIT');console.log('Local schema available');
 }catch(e){await client.query('ROLLBACK');throw e;}finally{await client.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
