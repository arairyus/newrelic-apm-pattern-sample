import type { ExternalGateway } from "./orderService";

type HttpExternalGatewayOptions = {
  baseUrl: string;
};

export function createHttpExternalGateway(
  options: HttpExternalGatewayOptions,
): ExternalGateway {
  return {
    async charge(input) {
      const response = await fetch(new URL("/charge", options.baseUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(input),
      });

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
