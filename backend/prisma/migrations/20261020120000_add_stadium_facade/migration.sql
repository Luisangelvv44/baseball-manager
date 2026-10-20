-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "facade_entrance_level" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "facade_plaza_level" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "facade_shop_level" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "facade_sign_level" INTEGER NOT NULL DEFAULT 1;
