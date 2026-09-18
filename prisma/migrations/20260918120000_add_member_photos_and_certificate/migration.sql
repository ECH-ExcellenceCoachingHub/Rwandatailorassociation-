-- The successor's national ID, and whether the member holds a trade
-- certificate (icyemezo cy'umwuga).
--
-- Both nullable. Every member enrolled before these were asked has no answer,
-- and "never asked" has to stay distinguishable from an answered no — the
-- association cannot put someone forward for certificated work on the strength
-- of a NULL that a NOT NULL DEFAULT false would have turned into a lie.
ALTER TABLE "members" ADD COLUMN "successorNationalId" TEXT,
ADD COLUMN "hasProfessionalCertificate" BOOLEAN;

-- The successor's photograph.
--
-- Its own table rather than a column on "members", for the same reason
-- "user_avatars" is one: these bytes are the largest thing the record owns,
-- and a SELECT * over members to render a list of names would otherwise pull
-- every successor's face with it.
--
-- The bytes live in Postgres because the app is deployed on Render, whose
-- filesystem does not survive a deploy, and no object store is configured.
CREATE TABLE "member_successor_photos" (
    "memberId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    -- One successor photograph per member, so the member id is the whole key.
    CONSTRAINT "member_successor_photos_pkey" PRIMARY KEY ("memberId")
);

-- Deleting the member takes the photograph with it. A face outliving the
-- record it belongs to is exactly the kind of data nobody remembers to clean.
ALTER TABLE "member_successor_photos" ADD CONSTRAINT "member_successor_photos_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
