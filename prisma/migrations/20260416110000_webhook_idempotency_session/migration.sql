-- Idempotency keys, session threading, per-session serialization.

ALTER TABLE "AgentTaskRun"
  ADD COLUMN "sessionKey" TEXT,
  ADD COLUMN "idempotencyKey" TEXT;

CREATE INDEX "AgentTaskRun_sessionKey_idx" ON "AgentTaskRun"("sessionKey");

ALTER TABLE "AgentSubscription"
  ADD COLUMN "sessionKeyTemplate" TEXT;

CREATE TABLE "WebhookIdempotency" (
  "id"             TEXT NOT NULL,
  "scope"          TEXT NOT NULL,
  "key"            TEXT NOT NULL,
  "runIds"         TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "responseJson"   JSONB,
  "expiresAt"      TIMESTAMP(3) NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookIdempotency_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WebhookIdempotency_scope_key_unique" UNIQUE ("scope", "key")
);
CREATE INDEX "WebhookIdempotency_expiresAt_idx" ON "WebhookIdempotency"("expiresAt");
