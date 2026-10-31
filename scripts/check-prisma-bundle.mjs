import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

// Check the actual build outputs, not just next.config.ts: deployment must fail
// at build time if a database function would ship without Prisma's compiler.
const routes = [
  'api/health/route',
  'api/cron/route',
  'api/telegram/webhook/route',
  'api/admin/[resource]/route',
  'admin/page',
];
const compiler = path.resolve('node_modules/.prisma/client/query_compiler_bg.wasm');
const header = (await readFile(compiler)).subarray(0, 4);
if (!header.equals(Buffer.from([0, 97, 115, 109]))) {
  throw new Error('Generated Prisma query compiler is missing or is not a WASM module. Run npm run db:generate.');
}
for (const route of routes) {
  const tracePath = path.resolve('.next/server/app', `${route}.js.nft.json`);
  const trace = JSON.parse(await readFile(tracePath, 'utf8'));
  const included = trace.files.some(file => path.resolve(path.dirname(tracePath), file) === compiler);
  if (!included || !(await stat(compiler)).isFile()) {
    throw new Error(`Prisma compiler WASM is missing from the deployment trace for ${route}. Check outputFileTracingIncludes.`);
  }
}
console.log(`Prisma compiler WASM verified in ${routes.length} serverless route traces.`);
