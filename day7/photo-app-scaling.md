# SnapShare – Scaling Plan

---

## Assumptions

- 10 million registered users.
- 10% are active each day → **1 million daily active users (DAU)**.
- Each active user uploads **1 photo per day**.
- Each active user views **50 feed pages per day** (each page loads ~10 thumbnail previews).
- Average original photo size: **2 MB**.
- Average thumbnail size: **50 KB**.
- Traffic is spread over a 24-hour day; no extreme single-hour spikes assumed.
- Seconds per day: 86,400.

---

## Back-of-the-Envelope Estimates

### Uploads per second
```
1,000,000 uploads/day ÷ 86,400 s/day ≈ 12 uploads/second
```

### Feed views per second
```
1,000,000 users × 50 pages/day = 50,000,000 page views/day
50,000,000 ÷ 86,400 ≈ 579 feed page views/second
Each page loads ~10 thumbnails → ~5,790 thumbnail requests/second
```

### Storage per year
```
Original photos : 1,000,000 photos/day × 2 MB   = 2,000,000 MB/day = ~2 TB/day
Thumbnails      : 1,000,000 photos/day × 0.05 MB =    50,000 MB/day = ~50 GB/day

Total per day   ≈ 2.05 TB
Total per year  ≈ 2.05 TB × 365 ≈ 748 TB ≈ 0.75 PB/year
```

### Read-heavy or write-heavy?

**Read-heavy.** Uploads run at ~12/s but thumbnail reads run at ~5,790/s — roughly a **480 : 1 read-to-write ratio**. The architecture must optimise for fast, scalable reads.

---

## Architecture Diagram

```
                        ┌────────────────────────────────────────────────────┐
                        │                    CLIENTS                         │
                        │          (mobile apps, web browsers)               │
                        └───────────────────┬────────────────────────────────┘
                                            │  HTTPS
                                            ▼
                        ┌───────────────────────────────┐
                        │             CDN               │
                        │   (cached thumbnails & assets)│
                        └───────────────┬───────────────┘
                                        │ cache miss
                                        ▼
                        ┌───────────────────────────────┐
                        │         Load Balancer         │
                        │     (round-robin / least      │
                        │      connections)             │
                        └──────┬────────────┬───────────┘
                               │            │
                   ┌───────────▼──┐   ┌─────▼─────────┐
                   │  App Server  │   │  App Server   │   (scale horizontally)
                   │     [1]      │   │     [2]       │
                   └──────┬───────┘   └──────┬────────┘
                          │                  │
              ┌───────────┼──────────────────┤
              │           │                  │
              ▼           ▼                  ▼
   ┌──────────────┐  ┌──────────┐   ┌───────────────────┐
   │    Cache     │  │  Queue   │   │  Primary Database  │
   │   (Redis)    │  │(e.g.     │   │  (PostgreSQL)      │
   │  feed & meta │  │RabbitMQ) │   │  users, follows,   │
   └──────────────┘  └────┬─────┘   │  photo metadata    │
                          │         └────────┬───────────┘
                          ▼                  │ replication
                   ┌────────────┐   ┌────────▼───────────┐
                   │  Thumbnail │   │   Read Replica     │
                   │  Worker    │   │   (PostgreSQL)     │
                   └─────┬──────┘   └────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │    Object Storage    │
              │  (e.g. S3-compatible)│
              │  originals +         │
              │  thumbnails          │
              └──────────────────────┘
```

---

## Component Explanations

| Component | Problem it solves |
|---|---|
| **CDN** | Serves thumbnails and static assets from edge nodes close to the user, reducing latency and offloading the majority of read traffic from the origin. |
| **Load Balancer** | Distributes incoming requests across multiple app servers so no single server becomes a bottleneck and the fleet can scale horizontally. |
| **App Servers** | Handle business logic — authentication, feed generation, upload coordination — and are stateless so new instances can be added freely. |
| **Cache (Redis)** | Stores pre-computed feed results and frequently accessed photo metadata in memory, cutting database reads for the most popular content. |
| **Primary Database** | Single source of truth for all writes — user accounts, follow relationships, and photo metadata — with ACID guarantees. |
| **Read Replica** | Offloads the heavy read traffic (feed queries, profile lookups) from the primary, keeping write performance stable. |
| **Queue** | Decouples the upload response from thumbnail generation; the app server acknowledges the upload immediately and the heavy work happens asynchronously. |
| **Thumbnail Worker** | Consumes jobs from the queue, generates thumbnails from original photos, and writes them to object storage without blocking the upload path. |
| **Object Storage** | Stores binary photo files (originals and thumbnails) cheaply and durably at any scale, outside the database where they would be expensive to store. |

---

## Upload Flow (Step by Step)

1. The client sends the photo file and metadata (caption, timestamp) to the **Load Balancer** over HTTPS.
2. The Load Balancer forwards the request to an available **App Server**.
3. The App Server writes the photo metadata (owner, caption, storage key, status = `processing`) to the **Primary Database**.
4. The App Server uploads the original photo binary to **Object Storage** and receives a storage key.
5. The App Server publishes a thumbnail-generation job (containing the storage key) to the **Queue** and returns a `201 Created` response to the client.
6. A **Thumbnail Worker** picks up the job, fetches the original from Object Storage, generates a 50 KB thumbnail, and writes it back to Object Storage under a thumbnail key.
7. The Worker updates the photo's status to `ready` in the Primary Database.
8. On the next feed load, the CDN serves the thumbnail directly; if it is not yet cached, the request falls through to Object Storage and the CDN caches the result.

---

## Trade-offs

**1. Eventual consistency in the feed vs. simplicity**
Using a read replica and a cache means a user's followers may see a newly uploaded photo a few seconds later than it was posted. This is acceptable for a social feed but would not be acceptable in a financial system. The gain — dramatically lower load on the primary database — is worth the slight staleness for this use case.

**2. Asynchronous thumbnailing vs. immediate availability**
Generating thumbnails in a background worker means the photo is not instantly viewable after upload. The client must poll or wait for a `ready` status. The trade-off is a better upload experience (fast acknowledgement, no timeout risk for large files) at the cost of a short delay before the photo appears in feeds. An alternative — generating the thumbnail synchronously in the request — would keep things simple but would slow every upload response and tie up app server threads during peak hours.
