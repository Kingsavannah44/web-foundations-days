# TicketHub – System Design Document

---

## Part 1: Requirements

### Functional Requirements
- Users can browse events and view available seats/tickets.
- Users can reserve a seat and complete a purchase within a time window.
- Users receive a booking confirmation (email + booking reference).
- Organisers can create events, set seat maps, and set ticket prices.
- Users can view their booking history and download e-tickets.

### Non-Functional Requirements
- **Availability:** 99.9% uptime; the system must stay responsive even during high-demand on-sales.
- **Correctness:** No two users may ever purchase the same seat. The seat reservation must be atomic at the database level — no application-level check is sufficient.
- **Fairness:** Every user who arrives during an on-sale should have an equal chance of buying a seat. No single user or bot should be able to hold a disproportionate number of seats. A queue-based virtual waiting room can enforce first-come-first-served order at extreme scale.
- **Speed:** Normal page loads under 200 ms; checkout response under 500 ms even during peak.
- **Scalability:** Must handle sudden ~280× traffic spikes when a popular event goes on sale without degrading latency or correctness.
- **Durability:** No booking data must ever be lost once a payment is confirmed.

---

## Part 2: Estimates

### Normal Traffic

```
Registered users        : 2,000,000
Daily visitors          : 50,000
Page views/day          : 50,000 × 10 = 500,000 page views/day
Average page views/s    : 500,000 ÷ 86,400 ≈ 6 page views/s
Tickets sold/day        : 5,000
Ticket purchases/s      : 5,000 ÷ 86,400 ≈ 0.06 purchases/s (1 every ~17 s)
```

Normal traffic is very light — the system is browsing-heavy with infrequent writes.

---

### Peak Traffic (Popular Concert On-Sale)

```
Concurrent hopeful buyers    : 200,000
Time window                  : 10 minutes = 600 seconds
Available seats              : 20,000

Page/search requests/s       : 200,000 users × (assume 5 requests each in 10 min)
                               = 1,000,000 requests ÷ 600 s ≈ 1,667 requests/s

Checkout attempts/s          : 200,000 attempts ÷ 600 s ≈ 333 checkout attempts/s

Ratio peak : normal (page views): 1,667 ÷ 6 ≈ 278× spike
```

The peak-to-normal ratio is ~278×. The architecture must absorb this spike without the database melting or double-selling seats.

---

### Read-heavy or Write-heavy?

**Read-heavy overall**, but with **write-critical spikes**. On a normal day the ratio is roughly 100 reads per purchase. During an on-sale the checkout rate jumps to 333 attempts/s, making the write path temporarily the bottleneck. Both paths must be optimised independently.

---

## Part 3: API Design

Base URL: `/api/v1`

---

### 1. List events
- **Method:** `GET`
- **Path:** `/events`
- **Description:** Returns a paginated list of upcoming events, optionally filtered by date, city or genre.
- **Query params:** `?city=Lagos&genre=afrobeats&page=1&limit=20`
- **Success:** `200 OK`

---

### 2. Get a single event
- **Method:** `GET`
- **Path:** `/events/:eventId`
- **Description:** Returns full details for one event including available seat counts per tier.
- **Success:** `200 OK`

---

### 3. Reserve a seat (start checkout)
- **Method:** `POST`
- **Path:** `/events/:eventId/reserve`
- **Description:** Atomically marks one or more seats as `reserved` for the requesting user for 10 minutes; returns a reservation ID and expiry timestamp.
- **Request body:**
  ```json
  { "seatIds": ["A12", "A13"] }
  ```
- **Success:** `201 Created`
- **Errors:** `409 Conflict` if a seat is already taken; `400 Bad Request` if seatIds is empty.

---

### 4. Confirm purchase (complete checkout)
- **Method:** `POST`
- **Path:** `/reservations/:reservationId/confirm`
- **Description:** Charges the user and marks the reserved seats as `sold`; returns a booking reference.
- **Request body:**
  ```json
  { "paymentToken": "tok_abc123" }
  ```
- **Success:** `200 OK`
- **Errors:** `402 Payment Required` if payment fails; `410 Gone` if the reservation has expired.

---

### 5. Get booking history
- **Method:** `GET`
- **Path:** `/users/:userId/bookings`
- **Description:** Returns all confirmed bookings for the authenticated user, newest first.
- **Success:** `200 OK`

---

### 6. Cancel a booking
- **Method:** `DELETE`
- **Path:** `/bookings/:bookingId`
- **Description:** Cancels a confirmed booking (if within the cancellation window) and triggers a refund; marks the seats as `available` again.
- **Success:** `204 No Content`
- **Errors:** `403 Forbidden` if outside the cancellation window.

---

## Part 4: Data Model

### `users`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| name | TEXT NOT NULL | |
| email | TEXT NOT NULL UNIQUE | |
| password_hash | TEXT NOT NULL | |
| created_at | TIMESTAMP | |

---

### `events`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| title | TEXT NOT NULL | |
| venue | TEXT NOT NULL | |
| city | TEXT NOT NULL | |
| event_date | TIMESTAMP NOT NULL | |
| organiser_id | INTEGER FK → users.id | |

---

### `seats`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| event_id | INTEGER FK → events.id NOT NULL | |
| label | TEXT NOT NULL | e.g. "A12" |
| tier | TEXT NOT NULL | e.g. "VIP", "General" |
| price | DECIMAL NOT NULL | |
| status | TEXT NOT NULL | `available` / `reserved` / `sold` |
| reserved_by | INTEGER FK → users.id | NULL unless reserved |
| reserved_until | TIMESTAMP | NULL unless reserved |

The `(event_id, label)` pair has a UNIQUE constraint — no two seats on the same event can share a label.

---

### `bookings`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| user_id | INTEGER FK → users.id NOT NULL | |
| event_id | INTEGER FK → events.id NOT NULL | |
| reference | TEXT NOT NULL UNIQUE | Human-readable booking code |
| status | TEXT NOT NULL | `confirmed` / `cancelled` |
| total_paid | DECIMAL NOT NULL | |
| created_at | TIMESTAMP | |

---

### `booking_seats` (join table)
| Column | Type | Notes |
|---|---|---|
| booking_id | INTEGER FK → bookings.id | |
| seat_id | INTEGER FK → seats.id | |

PRIMARY KEY is `(booking_id, seat_id)`.

**Relationships:**
- `users` → `bookings`: one-to-many (one user has many bookings).
- `events` → `seats`: one-to-many (one event has many seats).
- `bookings` ↔ `seats`: many-to-many via `booking_seats` (one booking covers multiple seats; a seat appears in at most one confirmed booking).

---

### How the Design Prevents Double-Selling a Seat

The `seats` table is the single source of truth. When a user requests a reservation, the app server runs this inside a **database transaction**:

```sql
UPDATE seats
SET    status        = 'reserved',
       reserved_by   = :userId,
       reserved_until = NOW() + INTERVAL '10 minutes'
WHERE  id     = :seatId
  AND  status = 'available';
```

The `WHERE status = 'available'` clause is the guard. If two users submit requests simultaneously, the database's row-level lock means only one `UPDATE` will match and change the row; the other will update zero rows and receive a `409 Conflict`. No application-level locking is needed because the database serialises concurrent writes to the same row. A background job sweeps for expired reservations every minute and resets their status back to `available`.

---

## Part 5: Architecture

### Diagram

```
                  ┌───────────────────────────────────────────┐
                  │                 CLIENTS                   │
                  │      (browsers, mobile apps)              │
                  └───────────────────┬───────────────────────┘
                                      │ HTTPS
                                      ▼
                  ┌───────────────────────────────────────────┐
                  │                  CDN                      │
                  │   (caches event pages, seat maps,         │
                  │    images, static JS/CSS at the edge)     │
                  └───────────────────┬───────────────────────┘
                                      │ cache miss
                                      ▼
                  ┌───────────────────────────────────────────┐
                  │             Load Balancer                 │
                  └──────────┬────────────────┬──────────────-┘
                             │                │
                 ┌───────────▼────┐  ┌────────▼───────┐
                 │  App Server 1  │  │  App Server 2  │  ← stateless; scale out
                 └───────┬────────┘  └────────┬───────┘
                         │                    │
          ┌──────────────┼────────────────────┤
          │              │                    │
          ▼              ▼                    ▼
 ┌──────────────┐  ┌───────────┐   ┌──────────────────────┐
 │  Cache       │  │  Queue    │   │   Primary Database   │
 │  (Redis)     │  │ (SQS /    │   │   (PostgreSQL)       │
 │  event data, │  │  RabbitMQ)│   │   users, events,     │
 │  seat counts │  └─────┬─────┘   │   seats, bookings    │
 └──────────────┘        │         └──────────┬───────────-┘
                         ▼                    │ replication
                 ┌──────────────┐   ┌─────────▼──────────┐
                 │  Email       │   │   Read Replica     │
                 │  Worker      │   │   (PostgreSQL)     │
                 └──────────────┘   └────────────────────┘
```

### Component Explanations

| Component | Problem it solves |
|---|---|
| **CDN** | Caches static event pages, seating charts and images at edge nodes, removing the bulk of browsing traffic from the origin — crucial during the rush before an on-sale. |
| **Load Balancer** | Distributes the ~1,667 requests/s peak spike evenly across app servers so no single instance is overwhelmed. |
| **App Servers** | Handle all business logic (browse, reserve, confirm); stateless so instances can be added in minutes during a traffic spike. |
| **Cache (Redis)** | Stores event metadata and available-seat counts so the database is not queried on every browsing request; counts are decremented atomically on reservation. |
| **Primary Database** | The authoritative store for all transactional data; row-level locking on `seats` prevents double-selling. |
| **Read Replica** | Handles read queries (event listings, booking history) so the primary can dedicate I/O to the write-heavy checkout path. |
| **Queue** | Decouples confirmation emails from the checkout response so slow email delivery never delays the user getting their booking reference. |
| **Email Worker** | Consumes jobs from the queue and sends booking confirmation emails with e-tickets, without blocking the checkout flow. |

---

### How the Architecture Survives the Big Sale

On a normal day the system handles ~6 page views/s and one purchase every 17 seconds. During a popular on-sale, 200,000 users arrive inside 10 minutes, pushing the load to ~1,667 requests/s and ~333 checkout attempts/s — roughly a **278× spike**. Here is how each layer absorbs it:

1. **CDN absorbs ~90% of traffic before it reaches the origin.** Event pages, venue images and the seating chart are static content that the CDN cached before the sale opened. Most of the 200,000 users never hit the app servers just to browse.

2. **App servers scale horizontally.** Because app servers are stateless (no session stored on the server), the load balancer can route any request to any instance. New instances can be provisioned in under a minute using auto-scaling, so the fleet grows with the spike and shrinks when it passes.

3. **Redis absorbs seat-availability reads.** Seat counts and event metadata are served from cache. The database primary is never asked "how many seats are left?" on every page load from 200,000 users simultaneously.

4. **The database primary only handles checkout writes.** With browsing traffic diverted to the CDN and Redis, and read queries going to the read replica, the primary's entire I/O budget is dedicated to the ~333 atomic seat-reservation updates per second at peak. This is a manageable write load for a modern PostgreSQL instance.

5. **Row-level locking prevents double-selling under any load.** Even at 333 concurrent checkout attempts/s, the `UPDATE … WHERE status = 'available'` constraint means only one transaction can claim any given seat. The others immediately receive a `409 Conflict` — no seat is ever sold twice, regardless of how many users are trying at once.

6. **The queue protects email infrastructure.** Sending 20,000 confirmation emails in a few minutes would overwhelm a direct SMTP connection. The queue absorbs the burst and the email worker drains it steadily, keeping confirmation delivery reliable without blocking checkouts.

---

## Part 6: Trade-offs

### Trade-off 1: 10-minute reservation hold vs. user experience vs. availability

Holding seats for 10 minutes while a user completes checkout prevents double-selling but means seats are temporarily invisible to other buyers. During a high-demand on-sale with 200,000 users competing for 20,000 seats, a large fraction of seats could be held by users who never complete payment, frustrating everyone else. A shorter window (e.g. 5 minutes) frees seats faster but risks users being timed out mid-payment. A longer window improves conversion but worsens availability. The 10-minute value is a deliberate compromise; a background sweeper that resets expired reservations immediately is essential to keep it working correctly.

### Trade-off 2: Caching seat availability vs. stale data

Caching seat counts in Redis makes browsing fast and reduces database load, but the cache may be a few seconds stale. A user who sees "50 seats remaining" might click through only to find none actually available — a frustrating experience. The alternative — bypassing the cache and always reading from the database — would be accurate but would not survive a 1,667 req/s spike. The chosen approach accepts minor staleness in the browse view while enforcing strict consistency only at the reservation step (via the atomic `UPDATE … WHERE status = 'available'`). This is the correct balance: eventual consistency for browsing, strong consistency for purchasing.
