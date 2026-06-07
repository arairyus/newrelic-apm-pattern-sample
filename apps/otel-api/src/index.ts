import "newrelic";
import {
  getDatabaseUrl,
  OrderService,
  PostgresOrderStore,
  startOrderSampleRuntime,
  createHttpExternalGateway,
} from "sample-core";
import { telemetry } from "./telemetry";
import { createApiApp } from "./api/app";
import { createFakeExternalApp } from "./external/fakeExternalServer";

const apiPort = Number(process.env.PORT ?? 3000);
const fakeExternalPort = Number(process.env.FAKE_EXTERNAL_PORT ?? 4001);

async function main() {
  const gateway = createHttpExternalGateway({
    baseUrl: `http://127.0.0.1:${fakeExternalPort}`,
    timeoutMs: 3_000,
  });
  const store = new PostgresOrderStore({
    connectionString: getDatabaseUrl(),
  });
  await store.init();

  const orderService = new OrderService(store, gateway, telemetry);
  const runtime = await startOrderSampleRuntime({
    apiPort,
    fakeExternalPort,
    createFakeExternalApp,
    createApiApp: () => createApiApp(orderService, telemetry),
    onShutdown: () => store.close(),
  });

  console.log(`API listening on http://127.0.0.1:${apiPort}`);
  console.log(`Fake external listening on http://127.0.0.1:${fakeExternalPort}`);

  const shutdown = async () => {
    await runtime.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("failed to start application", error);
  process.exit(1);
});
