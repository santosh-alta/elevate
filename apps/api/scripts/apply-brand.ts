/**
 * Apply a brand's built-in theme to the database without touching any other data (safe in production).
 * Run: npm run brand:apply -w @elevate/api -- altaschool
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { ALTA_THEME } from "@elevate/shared";

const THEMES: Record<string, unknown> = { altaschool: ALTA_THEME };

const slug = process.argv[2];
if (!slug || !THEMES[slug]) {
  console.error(`Usage: brand:apply <${Object.keys(THEMES).join("|")}>`);
  process.exit(1);
}
const prisma = new PrismaClient();
const tenant = await prisma.tenant.findUnique({ where: { slug } });
if (!tenant) {
  console.error(`No brand with slug "${slug}" in this database`);
  process.exit(1);
}
await prisma.tenant.update({ where: { id: tenant.id }, data: { theme: THEMES[slug] as Prisma.InputJsonValue } });
console.log(`Applied ${slug} theme to "${tenant.name}"`);
await prisma.$disconnect();
