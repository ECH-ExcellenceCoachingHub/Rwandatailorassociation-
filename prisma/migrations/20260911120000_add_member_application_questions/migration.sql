-- The association's own application questions: a successor (umusimbura) who
-- may act for the member, the number of shares held (imigabane), whether the
-- member has a company, and — for those who do — whether they will take on
-- interns. All nullable — every member enrolled before these were asked has
-- no answer, and "not asked" must stay distinguishable from "no".
ALTER TABLE "members" ADD COLUMN "successorName" TEXT,
ADD COLUMN "successorPhone" TEXT,
ADD COLUMN "successorRelation" TEXT,
ADD COLUMN "sharesSubscribed" INTEGER,
ADD COLUMN "hasCompany" BOOLEAN,
ADD COLUMN "acceptsInterns" BOOLEAN,
ADD COLUMN "internCapacity" INTEGER;
