import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { prismaPlugin } from "./plugins/prisma";
import { tenantPlugin } from "./plugins/tenant";
import { authPlugin } from "./plugins/auth";
import { HttpError } from "./lib/errors";
import { authRoutes } from "./routes/auth";
import { eventRoutes } from "./routes/events";
import { planningRoutes } from "./routes/planning";
import { registrationRoutes } from "./routes/registrations";
import { teamRoutes } from "./routes/teams";
import { judgingRoutes } from "./routes/judging";
import { mediaRoutes } from "./routes/media";
import { certificateRoutes } from "./routes/certificates";
import { reportRoutes } from "./routes/reports";
import { adminRoutes } from "./routes/admin";
import { guestRoutes } from "./routes/guests";
import { eventPageRoutes } from "./routes/eventPage";
import { uploadRoutes } from "./routes/uploads";
import { notificationRoutes } from "./routes/notifications";
import { paymentRoutes } from "./routes/payments";
import { hackathonRoutes } from "./routes/hackathon";
import { devRoutes } from "./routes/dev";
import { eventTypeRoutes } from "./routes/eventTypes";
import { campusRoutes } from "./routes/campuses";
import { feedbackRoutes } from "./routes/feedback";
import { aiRoutes } from "./routes/ai";
import { MAX_UPLOAD_BYTES } from "./lib/storage";

export async function buildApp() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    trustProxy: true,
  });

  await app.register(cors, {
    origin: process.env.NODE_ENV === "production" ? (process.env.CORS_ORIGINS?.split(",") ?? true) : true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  // Accept empty JSON bodies (clients often send content-type: application/json on every request).
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    const text = (body as string).trim();
    if (!text) return done(null, undefined);
    try {
      done(null, JSON.parse(text));
    } catch {
      const err = new Error("Invalid JSON body") as Error & { statusCode: number };
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 20, fieldSize: 10_000 } });

  // Order matters: tenant resolution runs before auth (auth looks up the membership in the tenant).
  await prismaPlugin(app);
  await tenantPlugin(app);
  await authPlugin(app);

  app.setErrorHandler((err: FastifyError | Error, req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.statusCode).send({ error: err.error, message: err.message });
    }
    // Duck-typed: schemas from @elevate/shared may come from the CJS build of zod (dual-package hazard).
    if (err instanceof ZodError || (err.name === "ZodError" && Array.isArray((err as ZodError).issues))) {
      const zerr = err as ZodError;
      const message = zerr.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
      return reply.status(400).send({ error: "validation_error", message, issues: zerr.issues });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") return reply.status(409).send({ error: "conflict", message: "That already exists" });
      if (err.code === "P2025") return reply.status(404).send({ error: "not_found", message: "Resource not found" });
    }
    const status = (err as FastifyError).statusCode;
    if (status && status < 500) {
      return reply.status(status).send({ error: (err as FastifyError).code ?? "bad_request", message: err.message });
    }
    req.log.error(err);
    return reply.status(500).send({ error: "internal_error", message: "Something went wrong" });
  });

  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send({ error: "not_found", message: `Route ${req.method} ${req.url} not found` });
  });

  app.get("/health", async () => ({ ok: true }));

  await app.register(
    async (v1) => {
      authRoutes(v1);
      eventRoutes(v1);
      planningRoutes(v1);
      registrationRoutes(v1);
      teamRoutes(v1);
      judgingRoutes(v1);
      mediaRoutes(v1);
      certificateRoutes(v1);
      reportRoutes(v1);
      adminRoutes(v1);
      guestRoutes(v1);
      eventPageRoutes(v1);
      uploadRoutes(v1);
      notificationRoutes(v1);
      paymentRoutes(v1);
      hackathonRoutes(v1);
      eventTypeRoutes(v1);
      campusRoutes(v1);
      feedbackRoutes(v1);
      aiRoutes(v1);
      devRoutes(v1); // non-production only
    },
    { prefix: "/v1" },
  );

  return app;
}
