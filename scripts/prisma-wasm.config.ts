// Optional offline/local migration tooling. Uses Prisma's bundled WASM schema engine.
// Production deploy uses the default verified Prisma schema engine.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { PrismaPg } from '@prisma/adapter-pg';
export default defineConfig({schema:'../prisma/schema.prisma',experimental:{adapter:true},engine:'js',adapter:async()=>new PrismaPg({connectionString:process.env.DIRECT_URL??process.env.DATABASE_URL??'postgresql://unused:unused@localhost/unused'})});
