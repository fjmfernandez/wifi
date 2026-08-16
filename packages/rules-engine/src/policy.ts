import { accessPolicyInputSchema, type AccessPolicyInput } from "@wifi/contracts";
import { compileSupportedReplyAttributes, type RadiusReplyAttribute } from "@wifi/radius";

export type PolicyLayer = "tenant" | "organization" | "site_group" | "site";
export type PolicyValue = Omit<AccessPolicyInput, "name">;

export interface PolicyOverride {
  layer: PolicyLayer;
  resourceId: string;
  values: Partial<PolicyValue>;
}

export interface EffectivePolicy {
  policy: AccessPolicyInput;
  sources: Record<keyof PolicyValue, { layer: PolicyLayer; resourceId: string }>;
}

const precedence: readonly PolicyLayer[] = ["tenant", "organization", "site_group", "site"];

export function resolveEffectivePolicy(
  name: string,
  overrides: readonly PolicyOverride[],
): EffectivePolicy {
  const ordered = [...overrides].sort(
    (left, right) => precedence.indexOf(left.layer) - precedence.indexOf(right.layer),
  );
  const values: Partial<PolicyValue> = {};
  const sources = {} as EffectivePolicy["sources"];

  for (const override of ordered) {
    for (const [key, value] of Object.entries(override.values) as [
      keyof PolicyValue,
      PolicyValue[keyof PolicyValue],
    ][]) {
      if (value !== undefined) {
        Object.assign(values, { [key]: value });
        Object.assign(sources, {
          [key]: { layer: override.layer, resourceId: override.resourceId },
        });
      }
    }
  }

  const policy = accessPolicyInputSchema.parse({ name, ...values });
  return { policy, sources };
}

export interface PolicyIssue {
  severity: "error" | "warning" | "blocked";
  code: string;
  message: string;
}

export function explainPolicy(policy: AccessPolicyInput): readonly PolicyIssue[] {
  const issues: PolicyIssue[] = [];
  if (
    policy.sessionTimeoutSeconds !== undefined &&
    policy.idleTimeoutSeconds !== undefined &&
    policy.idleTimeoutSeconds >= policy.sessionTimeoutSeconds
  ) {
    issues.push({
      severity: "warning",
      code: "IDLE_NOT_EFFECTIVE",
      message: "El idle timeout no actuará antes del límite total de sesión.",
    });
  }
  if (
    policy.totalBytesLimit !== undefined ||
    policy.uploadBytesLimit !== undefined ||
    policy.downloadBytesLimit !== undefined
  ) {
    issues.push({
      severity: "blocked",
      code: "BLOCKED_BY_LAB_VALIDATION_QUOTA",
      message:
        "La cuota se guarda, pero no se publica a RouterOS hasta validar límites y Gigawords en el laboratorio físico.",
    });
  }
  if (policy.portLimit > 1) {
    issues.push({
      severity: "warning",
      code: "SERVER_SIDE_CONCURRENCY_REQUIRED",
      message:
        "Port-Limit se devuelve al NAS; el límite simultáneo también debe aplicarse server-side en FreeRADIUS.",
    });
  }
  return issues;
}

export function compileEffectivePolicy(
  authorizationClass: string,
  input: unknown,
): readonly RadiusReplyAttribute[] {
  const policy = accessPolicyInputSchema.parse(input);
  return compileSupportedReplyAttributes({
    opaqueClass: authorizationClass,
    interimIntervalSeconds: policy.interimIntervalSeconds,
    portLimit: policy.portLimit,
    // RouterOS names rates from the NAS perspective: client upload is NAS RX,
    // client download is NAS TX. The UI always labels both directions explicitly.
    ...(policy.bandwidth
      ? { nasRxKbps: policy.bandwidth.uploadKbps, nasTxKbps: policy.bandwidth.downloadKbps }
      : {}),
    ...(policy.sessionTimeoutSeconds === undefined
      ? {}
      : { sessionTimeoutSeconds: policy.sessionTimeoutSeconds }),
    ...(policy.idleTimeoutSeconds === undefined
      ? {}
      : { idleTimeoutSeconds: policy.idleTimeoutSeconds }),
    ...((policy.totalBytesLimit ?? policy.uploadBytesLimit ?? policy.downloadBytesLimit) ===
    undefined
      ? {}
      : { totalQuotaBytes: BigInt(policy.totalBytesLimit ?? 0) }),
  });
}
