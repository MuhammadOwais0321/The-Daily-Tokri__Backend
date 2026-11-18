-- CreateTable
CREATE TABLE "theme_settings" (
    "id" VARCHAR(50) NOT NULL DEFAULT 'singleton',
    "activeTheme" VARCHAR(50) NOT NULL DEFAULT 'default',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "theme_settings_pkey" PRIMARY KEY ("id")
);
