import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import 'dotenv/config';
if(!process.env.TEST_DATABASE_URL||!new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test'))throw new Error('Set TEST_DATABASE_URL to a separate database ending in _test');
process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
export default defineConfig({resolve:{alias:{'@':resolve(__dirname,'.')}},test:{include:['tests/**/*.test.ts'],fileParallelism:false,testTimeout:20000,hookTimeout:20000}});
