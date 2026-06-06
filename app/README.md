# Sample App

This directory contains the sample API used for the New Relic APM comparison project.

## Run locally

```bash
cd app
pnpm install
pnpm build
pnpm start
```

`pnpm install` uses Takumi Guard through `app/.npmrc`.

## Run with Docker

```bash
cd ..
docker build -f app/Dockerfile -t sample-app .
docker run --rm -p 3000:3000 -p 4001:4001 sample-app
```

## Endpoints

- `GET /health`
- `POST /orders`
- `GET /orders/:id`

## Example request

```bash
curl -X POST http://127.0.0.1:3000/orders \
  -H 'content-type: application/json' \
  -d '{
    "userId": "user-1",
    "paymentToken": "tok_123",
    "items": [
      { "sku": "coffee", "quantity": 2, "unitPrice": 500 }
    ]
  }'
```
