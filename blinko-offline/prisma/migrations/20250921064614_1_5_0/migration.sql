-- CreateTable
CREATE TABLE "aiProviders" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "baseURL" VARCHAR(500),
    "apiKey" VARCHAR(500),
    "config" JSON,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "aiProviders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aiModels" (
    "id" SERIAL NOT NULL,
    "providerId" INTEGER NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "modelKey" VARCHAR(255) NOT NULL,
    "capabilities" JSON NOT NULL,
    "config" JSON,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "aiModels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "aiModels_providerId_idx" ON "aiModels"("providerId");

-- AddForeignKey
ALTER TABLE "aiModels" ADD CONSTRAINT "aiModels_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "aiProviders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
