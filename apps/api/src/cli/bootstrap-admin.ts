#!/usr/bin/env node

import { ZodError } from "zod";

import { runInitialAdminBootstrap } from "./bootstrap-admin-core.js";

function usage(): string {
  return [
    "Uso: pnpm --filter @wifi/api bootstrap:admin -- --show-secrets-once",
    "",
    "La marca --show-secrets-once es obligatoria: la URI TOTP y los códigos",
    "de recuperación solo se muestran una vez tras confirmar la transacción.",
    "Consulta apps/api/README.md para las variables requeridas.",
  ].join("\n");
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues
      .map((issue) => `${issue.path.join(".") || "entorno"}: ${issue.message}`)
      .join("; ");
  }
  if (error instanceof Error) return error.message;
  return "Error desconocido durante el bootstrap";
}

async function main(): Promise<void> {
  const arguments_ = process.argv.slice(2);
  if (arguments_.includes("--help")) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (arguments_.length !== 1 || arguments_[0] !== "--show-secrets-once") {
    throw new Error(`${usage()}\n\nOperación cancelada: falta confirmación explícita.`);
  }

  const result = await runInitialAdminBootstrap(process.env);
  if (result.status === "already_exists") {
    process.stdout.write(
      [
        "Bootstrap ya aplicado; no se han rotado ni mostrado secretos.",
        `tenant_id=${result.tenantId}`,
        `admin_user_id=${result.userId}`,
      ].join("\n") + "\n",
    );
    return;
  }

  const output = result.oneTimeOutput;
  process.stdout.write(
    [
      "Bootstrap creado y confirmado. Guarda ahora estos valores; no se volverán a mostrar.",
      `tenant_id=${result.tenantId}`,
      `admin_user_id=${result.userId}`,
      `totp_uri=${output.totpUri}`,
      `totp_secret=${output.totpSecret}`,
      "recovery_codes:",
      ...output.recoveryCodes.map((code) => `  ${code}`),
      "",
    ].join("\n"),
  );

  output.totpSecret = "";
  output.totpUri = "";
  output.recoveryCodes.fill("");
}

try {
  await main();
} catch (error) {
  process.stderr.write(`Bootstrap cancelado: ${safeErrorMessage(error)}\n`);
  process.exitCode = 1;
} finally {
  delete process.env["BOOTSTRAP_ADMIN_PASSWORD"];
  delete process.env["ADMIN_EMAIL_HMAC_KEY_BASE64"];
  delete process.env["DATA_ENCRYPTION_MASTER_KEY_BASE64"];
}
