-- CreateTable
CREATE TABLE "event_logs" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "actor_id" TEXT,
    "actor_username" TEXT,
    "domain" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "object_type" TEXT,
    "object_id" TEXT,
    "result" TEXT NOT NULL,
    "payload" JSONB,

    CONSTRAINT "event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_logs_created_at_idx" ON "event_logs"("created_at");

-- CreateIndex
CREATE INDEX "event_logs_actor_id_idx" ON "event_logs"("actor_id");
