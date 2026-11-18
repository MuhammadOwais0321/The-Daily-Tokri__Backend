-- CreateTable
CREATE TABLE "banners" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(120),
    "subtitle" VARCHAR(255),
    "imageUrl" VARCHAR(500) NOT NULL,
    "linkUrl" VARCHAR(500),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "banners_isActive_sortOrder_idx" ON "banners"("isActive", "sortOrder");
