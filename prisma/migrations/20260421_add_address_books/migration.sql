CREATE TABLE "address_books" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "label" VARCHAR(100),
    "contactName" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "address" VARCHAR(500) NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "address_books_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "address_books_userId_deletedAt_idx" ON "address_books"("userId", "deletedAt");

CREATE INDEX "address_books_userId_isDefault_idx" ON "address_books"("userId", "isDefault");

ALTER TABLE "address_books"
ADD CONSTRAINT "address_books_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE
ON UPDATE NO ACTION;
