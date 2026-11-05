-- Records who connected each Instagram account; only those users can invite.
ALTER TABLE "InstagramAccount" ADD COLUMN "connectedByUserId" TEXT;

ALTER TABLE "InstagramAccount"
  ADD CONSTRAINT "InstagramAccount_connectedByUserId_fkey"
  FOREIGN KEY ("connectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "InstagramAccount_connectedByUserId_idx" ON "InstagramAccount"("connectedByUserId");

-- Accounts connected before this column existed have no record of who added
-- them; attribute them to the workspace owner so existing teams can still invite.
UPDATE "InstagramAccount" AS ia
SET "connectedByUserId" = w."ownerId"
FROM "Workspace" AS w
WHERE ia."workspaceId" = w."id" AND ia."connectedByUserId" IS NULL;
