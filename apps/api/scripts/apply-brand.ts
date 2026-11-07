/**
 * Apply a brand's built-in theme to the database without touching any other data (safe in production).
 * Run: npm run brand:apply -w @elevate/api -- altaschool
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { ALTA_SETTINGS, ALTA_THEME } from "@elevate/shared";

const THEMES: Record<string, unknown> = { altaschool: ALTA_THEME };
const SETTINGS: Record<string, Record<string, unknown>> = { altaschool: ALTA_SETTINGS };

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
// Settings are merged so existing keys (e.g. payment keys) are kept.
const settings = { ...((tenant.settings ?? {}) as Record<string, unknown>), ...(SETTINGS[slug] ?? {}) };
await prisma.tenant.update({
  where: { id: tenant.id },
  data: { theme: THEMES[slug] as Prisma.InputJsonValue, settings: settings as Prisma.InputJsonValue },
});
console.log(`Applied ${slug} theme and contact settings to "${tenant.name}"`);
await prisma.$disconnect();
