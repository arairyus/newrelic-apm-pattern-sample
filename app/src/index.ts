import { createServer } from "node:http";
import { createApiApp } from "./api/app";
import {
  OrderService,
  OrderStore,
  createHttpExternalGateway,
} from "../../packages/sample-core/src";
import { createFakeExternalApp } from "./external/fakeExternalServer";

const apiPort = Number(process.env.PORT ?? 3000);
const fakeExternalPort = Number(process.env.FAKE_EXTERNAL_PORT ?? 4001);

async function main() {
  const fakeExternalApp = createFakeExternalApp();
  const fakeExternalServer = createServer(fakeExternalApp);
  await listen(fakeExternalServer, fakeExternalPort);

  const gateway = createHttpExternalGateway({
    baseUrl: `http://127.0.0.1:${fakeExternalPort}`,
  });
  const orderService = new OrderService(new OrderStore(), gateway);
  const apiApp = createApiApp(orderService);
  const apiServer = createServer(apiApp);
  await listen(apiServer, apiPort);

  console.log(`API listening on http://127.0.0.1:${apiPort}`);
  console.log(`Fake external listening on http://127.0.0.1:${fakeExternalPort}`);

  const shutdown = async () => {
    await Promise.all([close(apiServer), close(fakeExternalServer)]);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("failed to start application", error);
  process.exit(1);
});

function listen(server: ReturnType<typeof createServer>, port: number) {
  return new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => resolve());
  });
}

function close(server: ReturnType<typeof createServer>) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
