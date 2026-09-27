#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
project="basket-smoke-$(date +%s)-$$"

compose() {
  docker compose --project-name "$project" "$@"
}

cleanup() {
  status=$?
  trap - 0

  if [ "$status" -ne 0 ]; then
    compose logs --no-color || true
  fi

  if ! compose down --volumes --remove-orphans; then
    status=1
  fi

  exit "$status"
}

trap cleanup 0
trap 'exit 130' INT
trap 'exit 143' TERM

compose up --build --detach --wait --wait-timeout 120

compose exec -T api node --input-type=module <<'JS'
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const response = await fetch("http://127.0.0.1:3000/api/v1/baskets/price", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    items: [
      { sku: "COFFEE-001", quantity: 1 },
      { sku: "TEA-001", quantity: 1 },
      { sku: "BISCUITS-001", quantity: 1 },
    ],
    couponCode: "SAVE10",
  }),
});

assert.equal(response.status, 200);

const result = await response.json();

assert.equal(result.subtotalPence, 1000);
assert.equal(result.totalSavingsPence, 280);
assert.equal(result.totalPence, 720);
assert.equal(result.discounts.length, 2);
assert.equal(result.discounts[0].promotionCode, "THREE_FOR_TWO");
assert.equal(result.discounts[1].promotionCode, "TEN_PERCENT_OFF");

// This product is absent from the seed, so it must survive in the volume.
const prisma = new PrismaClient();

try {
  await prisma.product.create({
    data: {
      sku: "PERSISTENCE-CHECK",
      name: "Persistence check",
      pricePence: 123,
    },
  });
} finally {
  await prisma.$disconnect();
}
JS

compose up --detach --force-recreate --wait --wait-timeout 120

compose exec -T api node --input-type=module <<'JS'
import assert from "node:assert/strict";

const response = await fetch("http://127.0.0.1:3000/api/v1/baskets/price", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    items: [{ sku: "PERSISTENCE-CHECK", quantity: 1 }],
  }),
});

assert.equal(response.status, 200);

const result = await response.json();

assert.equal(result.subtotalPence, 123);
assert.equal(result.totalPence, 123);
assert.deepEqual(result.discounts, []);
JS

printf '%s\n' "Container pricing and database persistence checks passed."