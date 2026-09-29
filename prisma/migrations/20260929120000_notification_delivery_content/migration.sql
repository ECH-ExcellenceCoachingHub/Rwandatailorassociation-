-- Keep the exact email subject and email/SMS text each delivery sent, so an
-- officer can see what a member received. Older rows stay null and the admin
-- page reconstructs them from the template, marked as such.
ALTER TABLE "notification_deliveries" ADD COLUMN "subject" TEXT;
ALTER TABLE "notification_deliveries" ADD COLUMN "content" TEXT;
