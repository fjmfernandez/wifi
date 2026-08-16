export const RADIUS_RUNTIME_SQL_CONTRACT = {
  schema: "radius_runtime",
  credentials: "radius_runtime.credentials",
  replyAttributes: "radius_runtime.reply_attributes",
  accountingInbox: "radius_runtime.accounting_inbox",
  postAuthInbox: "radius_runtime.post_auth_inbox",
  radcheckCompatibilityView: "radius_runtime.radcheck_compat",
  radreplyCompatibilityView: "radius_runtime.radreply_compat",
} as const;

export const RADIUS_RUNTIME_ALLOWED_REPLY_ATTRIBUTES = [
  "Class",
  "Mikrotik-Rate-Limit",
  "Session-Timeout",
  "Idle-Timeout",
  "Acct-Interim-Interval",
  "Port-Limit",
] as const;
