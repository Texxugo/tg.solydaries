import { sql } from "drizzle-orm";

import { db } from "@/db";

/** Healthcheck de aplicacao + banco, usado por deploy e monitoramento. */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
  } catch (erro) {
    console.error("Healthcheck: banco indisponivel", erro);
    return Response.json(
      { status: "degraded", db: "erro", timestamp: new Date().toISOString() },
      { status: 503 },
    );
  }

  return Response.json({
    status: "ok",
    db: "ok",
    timestamp: new Date().toISOString(),
  });
}
