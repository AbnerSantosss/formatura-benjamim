-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "activeGateway" "Gateway";

-- CreateTable
CREATE TABLE "GatewayConfig" (
    "gateway" "Gateway" NOT NULL,
    "secretsEnc" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GatewayConfig_pkey" PRIMARY KEY ("gateway")
);
