import http from "k6/http";
import { check, group, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const baseUrl = __ENV.BASE_URL ?? "http://127.0.0.1:3000";
const vus = Number(__ENV.VUS ?? 10);
const duration = __ENV.DURATION ?? "30s";
const failureEvery = Number(__ENV.FAILURE_EVERY ?? 0);
const sleepMs = Number(__ENV.SLEEP_MS ?? 250);

const orderCreateDuration = new Trend("orders_create_duration", true);
const orderFetchDuration = new Trend("orders_fetch_duration", true);
const orderFailureRate = new Rate("orders_failure_rate");
const orderCreatedCounter = new Counter("orders_created_total");
const orderFailedCounter = new Counter("orders_failed_total");

export const options = {
  vus,
  duration,
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<1500"],
    orders_failure_rate: ["rate<0.30"],
    orders_create_duration: ["p(95)<1200"],
    orders_fetch_duration: ["p(95)<800"],
  },
};

export default function () {
  group("create-order", () => {
    const shouldFail = failureEvery > 0 && __ITER % failureEvery === failureEvery - 1;
    const payload = buildOrderPayload(shouldFail);
    const createResponse = http.post(`${baseUrl}/orders`, JSON.stringify(payload), {
      headers: {
        "content-type": "application/json",
      },
      tags: {
        endpoint: "create-order",
        expected_outcome: shouldFail ? "failure" : "success",
      },
    });

    orderCreateDuration.add(createResponse.timings.duration);

    const createSucceeded = check(createResponse, {
      "create status is 201 or 402": (res) => res.status === 201 || res.status === 402,
      "create body is json": (res) => isJsonResponse(res),
    });

    if (!createSucceeded) {
      orderFailureRate.add(1);
      orderFailedCounter.add(1);
      sleep(sleepMs / 1000);
      return;
    }

    const order = createResponse.json();
    const isExpectedFailure = shouldFail && createResponse.status === 402;
    const isExpectedSuccess = !shouldFail && createResponse.status === 201;

    orderFailureRate.add(createResponse.status === 402 ? 1 : 0);

    if (createResponse.status === 201) {
      orderCreatedCounter.add(1);
    } else {
      orderFailedCounter.add(1);
    }

    check(order, {
      "create outcome matches expectation": () => isExpectedFailure || isExpectedSuccess,
      "create response has order id": (body) => typeof body?.id === "string" && body.id.length > 0,
      "create response has status": (body) => typeof body?.status === "string",
    });

    if (typeof order?.id === "string") {
      group("get-order", () => {
        const getResponse = http.get(`${baseUrl}/orders/${order.id}`, {
          tags: {
            endpoint: "get-order",
          },
        });

        orderFetchDuration.add(getResponse.timings.duration);

        check(getResponse, {
          "get status is 200": (res) => res.status === 200,
          "get body is json": (res) => isJsonResponse(res),
        });
      });
    }
  });

  sleep(sleepMs / 1000);
}

function buildOrderPayload(shouldFail) {
  const quantity = (__VU % 3) + 1;
  const unitPrice = 400 + ((__ITER + __VU) % 5) * 100;

  return {
    userId: `user-${__VU}`,
    paymentToken: shouldFail ? "declined" : `tok_${__VU}_${__ITER}`,
    items: [
      {
        sku: `coffee-${(__ITER % 4) + 1}`,
        quantity,
        unitPrice,
      },
    ],
  };
}

function isJsonResponse(response) {
  const contentType = response.headers["Content-Type"] ?? response.headers["content-type"];
  return typeof contentType === "string" && contentType.includes("application/json");
}
