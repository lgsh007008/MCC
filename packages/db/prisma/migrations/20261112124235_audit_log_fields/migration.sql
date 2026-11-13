-- AlterTable
ALTER TABLE "event_logs" ADD COLUMN     "action_label" TEXT,
ADD COLUMN     "actor_role" TEXT,
ADD COLUMN     "error_code" TEXT,
ADD COLUMN     "ip" TEXT,
ADD COLUMN     "method" TEXT,
ADD COLUMN     "object_code" TEXT,
ADD COLUMN     "path" TEXT,
ADD COLUMN     "request_id" TEXT,
ADD COLUMN     "status_code" INTEGER,
ADD COLUMN     "user_agent" TEXT;

-- CreateIndex
CREATE INDEX "event_logs_tenant_id_created_at_idx" ON "event_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "event_logs_actor_id_created_at_idx" ON "event_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "event_logs_domain_action_idx" ON "event_logs"("domain", "action");
