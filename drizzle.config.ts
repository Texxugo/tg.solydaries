import { defineConfig } from "drizzle-kit";

// drizzle-kit roda fora do Next, entao carregamos o .env manualmente
// (process.loadEnvFile e nativo do Node 20.12+).
process.loadEnvFile?.(".env");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
