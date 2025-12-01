## Frontend Test Queries - Verified with Current Mongo/Deals Data

These queries are aligned with the **current Mongo → deals DB** (not the old CSV
snapshot). All of them have been verified by calling `TripPlanner` directly
against `recommendation_service.db` and **return at least one bundle**.

Because the synthetic hotel deals represent long availability windows, their
`total_price_usd` is very large. To make sure bundles are not filtered out by
budget, these test queries use **high budgets (~$70,000)**. That is expected
for this dataset.

All queries use **YYYY-MM-DD** dates so the rule-based fallback intent parser
can extract them if OpenAI is unavailable.

---

### ✅ 1. SFO → Los Angeles (Nov 27–29, 2025)

Use this in the AI concierge chat:

```text
I need a trip from SFO to LAX from 2025-11-27 to 2025-11-29 for 2 people with a budget of $70000.
```

**Expected:** 1–3 bundles, with a flight `SFO → LAX` around 2025‑11‑27 and a
hotel in Los Angeles.

---

### ✅ 2. Orlando → Miami (Jan 1–3, 2024)

```text
I need a trip from MCO to MIA from 2024-01-01 to 2024-01-03 for 2 people with a budget of $70000.
```

**Expected:** 1–3 bundles, flight `MCO → MIA` on 2024‑01‑01 and a hotel in Miami.

---

### ✅ 3. Dallas → Boston (Jan 1–3, 2024)

```text
I need a trip from DFW to BOS from 2024-01-01 to 2024-01-03 for 2 people with a budget of $70000.
```

**Expected:** 1–3 bundles, flight `DFW → BOS` on 2024‑01‑01 and a hotel in Boston.

---

### ✅ 4. Chicago Midway → Las Vegas (Jan 1–3, 2024)

```text
I need a trip from MDW to LAS from 2024-01-01 to 2024-01-03 for 2 people with a budget of $70000.
```

**Expected:** 1–3 bundles, flight `MDW → LAS` on 2024‑01‑01 and a hotel in Las Vegas.

---

### ✅ 5. Chicago Midway → Phoenix (Jan 1–3, 2024)

```text
I need a trip from MDW to PHX from 2024-01-01 to 2024-01-03 for 2 people with a budget of $70000.
```

**Expected:** 1–3 bundles, flight `MDW → PHX` on 2024‑01‑01 and a hotel in Phoenix.

---

### Notes

- If you get **“I couldn't find any matching deals”** for these queries:
  - Make sure:
    - `docker-compose up -d` is running (Kafka, Redis, Postgres).
    - Root `npm run dev` is running (Node services + FastAPI at port 8000).
    - `services/recommendation-service/run_all_workers.sh` is running
      (Mongo reader + normalizer + detector + tagger + emitter).
    - The frontend `npm run dev` is running and
      `VITE_RECOMMENDATION_SERVICE_URL` (if set) points to `http://localhost:8000`.
  - Then try again – these specific origin/destination/date combinations are
    known to exist in the current deals DB.


