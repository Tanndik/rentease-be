-- DropForeignKey
ALTER TABLE `Car` DROP FOREIGN KEY `Car_ownerId_fkey`;

-- DropIndex
DROP INDEX `Car_ownerId_idx` ON `Car`;

-- AddForeignKey
ALTER TABLE `Car` ADD CONSTRAINT `Car_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
