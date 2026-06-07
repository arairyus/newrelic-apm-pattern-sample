import type { ExternalGateway } from "./orderService";

type HttpExternalGatewayOptions = {
  baseUrl: string;
  timeoutMs?: number;
};

export function createHttpExternalGateway(
  options: HttpExternalGatewayOptions,
): ExternalGateway {
  return {
    async charge(input) {
      const controller = new AbortController();
      const timeoutMs = options.timeoutMs ?? 3_000;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetch(new URL("/charge", options.baseUrl), {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(input),
          signal: controller.signal,
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error(`external charge timed out (${timeoutMs}ms)`);
        }

        throw error;
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;

        throw new Error(payload?.error ?? `external charge failed (${response.status})`);
      }

      return (await response.json()) as { chargeId: string; status: "approved" };
    },
  };
}
