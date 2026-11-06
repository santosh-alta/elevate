import { buildApp } from "./app";
import { startWorker } from "./worker";

const port = Number(process.env.PORT ?? 4000);
const app = await buildApp();
let stopWorker = () => {};

try {
  await app.listen({ port, host: "0.0.0.0" });
  stopWorker = startWorker(app.log);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    stopWorker();
    await app.close();
    process.exit(0);
  });
}
