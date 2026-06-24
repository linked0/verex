import { PrismaClient } from "@prisma/client";

// Single Prisma client for the API process.
export const prisma = new PrismaClient();
