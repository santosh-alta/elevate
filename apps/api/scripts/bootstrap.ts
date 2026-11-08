/**
 * First-time production setup for one brand: creates the brand (with its built-in theme), its web addresses
 * and an admin. Never deletes anything, so it is safe to run again (e.g. to add the Vercel address later).
 *
 * Run (with DATABASE_URL pointing at the production database):
 *   npm run bootstrap -w @elevate/api -- --brand altaschool --admin you@altaschool.tech --name "Your Name" \
 *     --domain event.altaschool.tech --temp-domain alta-events.vercel.app
 *
 *   --domain       the brand's own domain; stays unverified until its DNS records are verified in Admin → Settings
 *   --temp-domain  an address we control (e.g. *.vercel.app); marked verified so the site and emails work right away
 *   --platform     also make the admin a platform admin (can create other brands)
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { ALTA_SETTINGS, ALTA_THEME } from "@elevate/shared";

const BRANDS: Record<string, { name: string; theme: unknown; settings: unknown }> = {
  altaschool: { name: "ALTA School of Technology", theme: ALTA_THEME, settings: ALTA_SETTINGS },
};

function args() {
  const out: { brand?: string; admin?: string; name?: string; domains: string[]; temp: string[]; platform: boolean } = {
    domains: [],
    temp: [],
    platform: false,
  };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    const v = a[i + 1];
    switch (a[i]) {
      case "--brand": out.brand = v; i++; break;
      case "--admin": out.admin = v?.toLowerCase(); i++; break;
      case "--name": out.name = v; i++; break;
      case "--domain": out.domains.push(v.toLowerCase()); i++; break;
      case "--temp-domain": out.temp.push(v.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")); i++; break;
      case "--platform": out.platform = true; break;
      default: throw new Error(`Unknown option ${a[i]}`);
    }
  }
  return out;
}

const opts = args();
const brand = opts.brand && BRANDS[opts.brand];
if (!opts.brand || !brand) {
  console.error(`Usage: bootstrap --brand <${Object.keys(BRANDS).join("|")}> [--admin email --name "Name"] [--domain host] [--temp-domain host] [--platform]`);
  process.exit(1);
}

const prisma = new PrismaClient();

let tenant = await prisma.tenant.findUnique({ where: { slug: opts.brand } });
if (tenant) {
  console.log(`Brand "${tenant.name}" already exists — keeping it`);
} else {
  tenant = await prisma.tenant.create({
    data: {
      slug: opts.brand,
      name: brand.name,
      theme: brand.theme as Prisma.InputJsonValue,
      settings: brand.settings as Prisma.InputJsonValue,
    },
  });
  console.log(`Created brand "${tenant.name}"`);
}

const hasPrimary = (await prisma.tenantDomain.count({ where: { tenantId: tenant.id, isPrimary: true } })) > 0;
const wanted = [
  ...opts.domains.map((hostname, i) => ({ hostname, isPrimary: !hasPrimary && i === 0, verifiedAt: null as Date | null })),
  ...opts.temp.map((hostname) => ({ hostname, isPrimary: false, verifiedAt: new Date() })),
];
for (const d of wanted) {
  const existing = await prisma.tenantDomain.findUnique({ where: { hostname: d.hostname } });
  if (existing) {
    if (existing.tenantId !== tenant.id) throw new Error(`${d.hostname} already belongs to another brand`);
    console.log(`Address ${d.hostname} already set up`);
    continue;
  }
  await prisma.tenantDomain.create({ data: { tenantId: tenant.id, ...d } });
  console.log(`Added address ${d.hostname}${d.verifiedAt ? " (verified)" : " (verify its DNS in Admin → Settings)"}`);
}

if (opts.admin) {
  const user =
    (await prisma.user.findUnique({ where: { email: opts.admin } })) ??
    (await prisma.user.create({ data: { email: opts.admin, name: opts.name ?? opts.admin.split("@")[0] } }));
  if (opts.platform && !user.isPlatformAdmin) {
    await prisma.user.update({ where: { id: user.id }, data: { isPlatformAdmin: true } });
  }
  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    update: { role: "BRAND_ADMIN" },
    create: { tenantId: tenant.id, userId: user.id, role: "BRAND_ADMIN" },
  });
  console.log(`${user.email} is a brand admin of ${tenant.name}${opts.platform ? " and a platform admin" : ""}`);
}

await prisma.$disconnect();
