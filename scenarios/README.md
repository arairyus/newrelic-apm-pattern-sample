# Load Test Scenarios

## `k6-orders.js`

Shared load test scenario for all five patterns.

### Run

```bash
k6 run scenarios/k6-orders.js
```

### Environment variables

- `BASE_URL`: target app URL. Default is `http://127.0.0.1:3000`
- `VUS`: concurrent virtual users. Default is `10`
- `DURATION`: total test duration. Default is `30s`
- `FAILURE_EVERY`: make every Nth order use `paymentToken=declined`. Default is `0`
- `SLEEP_MS`: think time between iterations. Default is `250`

### Examples

Baseline:

```bash
BASE_URL=http://127.0.0.1:3000 VUS=20 DURATION=1m k6 run scenarios/k6-orders.js
```

OTel API:

```bash
BASE_URL=http://127.0.0.1:3001 VUS=20 DURATION=1m k6 run scenarios/k6-orders.js
```

Collector gateway mode:

```bash
BASE_URL=http://127.0.0.1:3002 VUS=20 DURATION=1m k6 run scenarios/k6-orders.js
```

Collector agent mode:

```bash
BASE_URL=http://127.0.0.1:3003 VUS=20 DURATION=1m k6 run scenarios/k6-orders.js
```

OTel direct-to-New Relic mode:

```bash
BASE_URL=http://127.0.0.1:3004 VUS=20 DURATION=1m k6 run scenarios/k6-orders.js
```

Failure mix:

```bash
BASE_URL=http://127.0.0.1:3000 FAILURE_EVERY=5 k6 run scenarios/k6-orders.js
```
