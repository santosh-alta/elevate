import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { EVENT_FAMILIES, EVENT_FAMILY_KEYS, EVENT_TYPES, EVENT_TYPE_HINTS, EVENT_TYPE_LABELS } from "@elevate/shared";
import { prisma } from "../plugins/prisma";
import { requireTenant } from "../plugins/tenant";
import { isStaff, requireBrandAdmin } from "../lib/permissions";
import { badRequest, conflict, notFound } from "../lib/errors";
import { normalizeTags } from "../lib/tags";

const HIDDEN_FROM_PUBLIC = ["DRAFT", "PLANNING"];

const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  family: z.enum(EVENT_FAMILY_KEYS),
  baseType: z.enum(EVENT_TYPES),
  description: z.string().trim().max(500).nullable().optional(),
  icon: z.string().trim().max(60).nullable().optional(),
  modules: z.record(z.boolean()).nullable().optional(),
  defaultTags: z.array(z.string().trim().min(1).max(40)).max(15).optional(),
  sortOrder: z.number().int().optional(),
});

function assertBaseTypeInFamily(family: string, baseType: string) {
  const info = EVENT_FAMILIES.find((f) => f.key === family);
  if (!info) throw badRequest(`Unknown family ${family}`);
  if (!(info.types as string[]).includes(baseType)) {
    throw badRequest(`${EVENT_TYPE_LABELS[baseType as keyof typeof EVENT_TYPE_LABELS] ?? baseType} isn't a type in "${info.label}"`);
  }
}

async function assertNameFree(tenantId: string, name: string, exceptId?: string) {
  const clash = await prisma.eventCategory.findFirst({
    where: { tenantId, name: { equals: name, mode: "insensitive" }, ...(exceptId && { id: { not: exceptId } }) },
  });
  if (clash) throw conflict(`There's already an event type called "${clash.name}"`);
}

export function eventTypeRoutes(app: FastifyInstance) {
  /** Picker data: built-in types grouped by family, plus this brand's own types. */
  app.get("/event-types", async (req) => {
    const tenant = requireTenant(req);
    const { all } = z.object({ all: z.string().optional() }).parse(req.query);
    const includeArchived = (all === "1" || all === "true") && isStaff(req);
    const categories = await prisma.eventCategory.findMany({
      where: { tenantId: tenant.id, ...(!includeArchived && { archivedAt: null }) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { events: true } } },
    });
    return {
      families: EVENT_FAMILIES.map((f) => ({
        key: f.key,
        label: f.label,
        description: f.description,
        icon: f.icon,
        types: f.types.map((type) => ({ type, label: EVENT_TYPE_LABELS[type], hint: EVENT_TYPE_HINTS[type] ?? null, builtIn: true })),
        custom: categories
          .filter((c) => c.family === f.key)
          .map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description,
            icon: c.icon,
            baseType: c.baseType,
            family: c.family,
            defaultTags: c.defaultTags,
            eventCount: c._count.events,
            modules: c.modules ?? null,
            sortOrder: c.sortOrder,
            archived: !!c.archivedAt,
          })),
      })),
    };
  });

  app.post("/event-categories", async (req, reply) => {
    requireBrandAdmin(req);
    const tenant = requireTenant(req);
    const body = categorySchema.parse(req.body);
    assertBaseTypeInFamily(body.family, body.baseType);
    await assertNameFree(tenant.id, body.name);
    const category = await prisma.eventCategory.create({
      data: {
        tenantId: tenant.id,
        name: body.name,
        family: body.family,
        baseType: body.baseType,
        description: body.description ?? null,
        icon: body.icon ?? null,
        modules: body.modules ?? Prisma.DbNull,
        defaultTags: normalizeTags(body.defaultTags),
        sortOrder: body.sortOrder ?? 0,
      },
    });
    return reply.status(201).send(category);
  });

  app.patch<{ Params: { id: string } }>("/event-categories/:id", async (req) => {
    requireBrandAdmin(req);
    const tenant = requireTenant(req);
    const existing = await prisma.eventCategory.findFirst({ where: { id: req.params.id, tenantId: tenant.id } });
    if (!existing) throw notFound("Event type");
    const body = categorySchema.partial().extend({ archived: z.boolean().optional() }).parse(req.body);
    if (body.family !== undefined || body.baseType !== undefined) {
      assertBaseTypeInFamily(body.family ?? existing.family, body.baseType ?? existing.baseType);
    }
    if (body.name !== undefined) await assertNameFree(tenant.id, body.name, existing.id);
    const { archived, modules, defaultTags, ...fields } = body;
    return prisma.eventCategory.update({
      where: { id: existing.id },
      data: {
        ...fields,
        ...(modules !== undefined && { modules: modules ?? Prisma.DbNull }),
        ...(defaultTags !== undefined && { defaultTags: normalizeTags(defaultTags) }),
        ...(archived !== undefined && { archivedAt: archived ? existing.archivedAt ?? new Date() : null }),
      },
    });
  });

  app.delete<{ Params: { id: string } }>("/event-categories/:id", async (req, reply) => {
    requireBrandAdmin(req);
    const tenant = requireTenant(req);
    const existing = await prisma.eventCategory.findFirst({ where: { id: req.params.id, tenantId: tenant.id } });
    if (!existing) throw notFound("Event type");
    const count = await prisma.event.count({ where: { categoryId: existing.id } });
    if (count) {
      return reply.status(409).send({
        error: "conflict",
        message: `${count} event${count === 1 ? " uses" : "s use"} this type. Archive it instead.`,
        count,
      });
    }
    await prisma.eventCategory.delete({ where: { id: existing.id } });
    return { ok: true };
  });

  /** Tags used on this brand's public events, most used first. Staff with ?all=1 get every status. */
  app.get("/tags", async (req) => {
    const tenant = requireTenant(req);
    const { all } = z.object({ all: z.string().optional() }).parse(req.query);
    const everything = (all === "1" || all === "true") && isStaff(req);
    const statusFilter = everything ? Prisma.empty : Prisma.sql`AND e."status"::text NOT IN (${Prisma.join(HIDDEN_FROM_PUBLIC)})`;
    const rows = await prisma.$queryRaw<{ tag: string; count: bigint }[]>`
      SELECT mode() WITHIN GROUP (ORDER BY t) AS tag, COUNT(DISTINCT e."id")::bigint AS count
      FROM "Event" e, unnest(e."tags") AS t
      WHERE e."tenantId" = ${tenant.id} ${statusFilter}
      GROUP BY lower(t)
      ORDER BY count DESC, tag ASC`;
    return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
  });
}
