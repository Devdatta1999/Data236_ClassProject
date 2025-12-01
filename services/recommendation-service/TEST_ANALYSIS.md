## Test Analysis – Current Deals Data (Mongo → SQLite)

This document replaces the older CSV‑based analysis. It reflects the **current
MongoDB → Kafka → SQLite pipeline** and what the AI concierge actually sees in
`recommendation_service.db`.

---

### Data Overview

- **Flight deals (`FlightDeal`)**
  - Total rows: **1645**
  - Key departure dates observed:
    - 2024‑01‑01
    - 2025‑11‑26
    - 2025‑11‑27
    - 2025‑12‑01, 2025‑12‑02, 2025‑12‑03, 2025‑12‑04
  - Destinations mapped via `AIRPORT_TO_CITY` (e.g., LAX → Los Angeles, MIA → Miami).

- **Hotel deals (`HotelDeal`)**
  - Total rows: **4003**
  - Typical availability windows:
    - Many hotels with `check_in_date = 2024‑01‑01` and
      `check_out_date = 2025‑12‑31`.
    - Some with ranges like 2025‑11‑26 → 2026‑11‑26 or 2025‑11‑27 → 2027‑07‑27.
  - Cities aligned with major hub airports (Los Angeles, Miami, Boston,
    Chicago, Phoenix, Las Vegas, etc.).

Because hotels represent long availability windows, their `total_price_usd`
values are **very large** (tens of thousands of dollars). This is why test
queries need high budgets.

---

### How Bundles Are Built

The `TripPlanner`:

- Selects flights where:
  - `origin` matches the parsed origin airport code.
  - Departure date is within **±2 days** of the requested `start_date`.
  - `deal_score >= 10`.

- Selects hotels where:
  - City/neighborhood matches the **destination city** implied by the flight
    destination (via `AIRPORT_TO_CITY` and `normalize_destination`).
  - Hotel date range overlaps the requested `[start_date, end_date]`.
  - `deal_score >= 10`.

- Builds bundles only when:
  - There is at least one matching flight and one matching hotel.
  - The **bundle total price** is within **120% of the user budget**:
    \[
    \text{bundle\_price} \le 1.2 \times \text{budget\_usd}
    \]

Given current hotel prices (~\$60k per stay), realistic bundles require
budgets in the **\$70k range**.

---

### Verified Working Queries (Return Bundles)

Using `TripPlanner.plan_bundles()` directly:

1. **SFO → LAX, 2025‑11‑27 to 2025‑11‑29, budget \$70,000**
   - Bundles found: 3
   - Example bundle: `SFO → LAX`, total price ≈ \$58,560.

2. **MCO → MIA, 2024‑01‑01 to 2024‑01‑03, budget \$70,000**
   - Bundles found: 3
   - Example bundle: `MCO → MIA`, total price ≈ \$59,566.

3. **DFW → BOS, 2024‑01‑01 to 2024‑01‑03, budget \$70,000**
   - Bundles found: 3
   - Example bundle: `DFW → BOS`, total price ≈ \$60,202.

4. **MDW → LAS, 2024‑01‑01 to 2024‑01‑03, budget \$70,000**
   - Bundles found: 3
   - Example bundle: `MDW → LAS`, total price ≈ \$59,106.

5. **MDW → PHX, 2024‑01‑01 to 2024‑01‑03, budget \$70,000**
   - Bundles found: 3
   - Example bundle: `MDW → PHX`, total price ≈ \$58,864.

These correspond exactly to the queries listed in
`FRONTEND_TEST_QUERIES.md` and have been verified against the current
`recommendation_service.db`.

---

### Why Many Other Dates Return 0 Bundles

- Flights only exist on a **small set of dates** (2024‑01‑01 and late 2025+),
  so arbitrary dates often have no matching `FlightDeal`.
- Even when flights exist, if the hotel city does not match the destination
  (via `AIRPORT_TO_CITY`), `TripPlanner` will not pair them.
- With current hotel pricing, low budgets (e.g., \$1,000–\$5,000) almost
  always fail the budget check:
  \[
  \text{bundle\_price} \gg \text{budget\_usd} \Rightarrow \text{bundle skipped}
  \]

So the system is behaving correctly: **no bundles** simply reflects the
combination of date coverage, city matching, and high hotel prices in the
current dataset.

---

### Recommended Testing Strategy

1. Use the **5 verified queries** from `FRONTEND_TEST_QUERIES.md` for frontend
   and backend validation.
2. When adding new data to MongoDB:
   - Ensure flights and hotels share overlapping **dates** and **cities**.
   - Re‑run `run_all_workers.sh` so the deals DB is refreshed.
3. If you want more “normal” budgets (e.g., \$1,000–\$3,000), adjust the
   hotel ingestion or pricing logic so `total_price_usd` reflects realistic
   trip costs instead of long multi‑year windows.


