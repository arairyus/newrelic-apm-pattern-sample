import { createServer, type RequestListener } from "node:http";

export async function startOrderSampleRuntime(options: {
  apiPort: number;
  fakeExternalPort: number;
  createApiApp: () => RequestListener;
  createFakeExternalApp: () => RequestListener;
  onShutdown?: () => Promise<void>;
}) {
  const fakeExternalServer = createServer(options.createFakeExternalApp());
  await listen(fakeExternalServer, options.fakeExternalPort);

  const apiServer = createServer(options.createApiApp());
  await listen(apiServer, options.apiPort);

  return {
    apiServer,
    fakeExternalServer,
    async shutdown() {
      await Promise.all([
        close(apiServer),
        close(fakeExternalServer),
        options.onShutdown?.(),
      ]);
    },
  };
}

export function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:5432/newrelic_apm_pattern_sample"
  );
}

export function listen(server: ReturnType<typeof createServer>, port: number) {
  return new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => resolve());
  });
}

export function close(server: ReturnType<typeof createServer>) {
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
