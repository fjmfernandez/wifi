#!/usr/bin/env node

import { ZodError } from "zod";

import { runAdminPasswordReset } from "./reset-admin-password-core.js";

function usage(): string {
  return [
    "Uso: pnpm --filter @wifi/api reset:admin-password -- --confirm-reset",
    "",
    "La marca --confirm-reset es obligatoria: el comando cambia la contraseña",
    "del administrador existente y revoca sus sesiones activas.",
    "Variables requeridas: BOOTSTRAP_DATABASE_URL, RESET_ADMIN_EMAIL,",
    "RESET_ADMIN_PASSWORD y ADMIN_EMAIL_HMAC_KEY_BASE64.",
  ].join("\n");
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues
      .map((issue) => `${issue.path.join(".") || "entorno"}: ${issue.message}`)
      .join("; ");
  }
  if (error instanceof Error) return error.message;
  return "Error desconocido durante el reset";
}

async function main(): Promise<void> {
  const arguments_ = process.argv.slice(2);
  if (arguments_.includes("--help")) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (arguments_.length !== 1 || arguments_[0] !== "--confirm-reset") {
    throw new Error(`${usage()}\n\nOperación cancelada: falta confirmación explícita.`);
  }

  const result = await runAdminPasswordReset(process.env);
  process.stdout.write(
    [
      "Contraseña de administrador actualizada.",
      `admin_user_id=${result.userId}`,
      `tenant_ids=${result.tenantIds.join(",")}`,
      `revoked_sessions=${result.revokedSessionCount}`,
      "",
    ].join("\n"),
  );
}

try {
  await main();
} catch (error) {
  process.stderr.write(`Reset cancelado: ${safeErrorMessage(error)}\n`);
  process.exitCode = 1;
} finally {
  delete process.env["RESET_ADMIN_PASSWORD"];
  delete process.env["ADMIN_EMAIL_HMAC_KEY_BASE64"];
}
