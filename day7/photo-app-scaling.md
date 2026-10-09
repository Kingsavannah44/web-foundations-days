# SnapShare – Scaling Plan

---

## 1. Assumptions

- 10 million registered users total.
- 10% are active on any given day → **1,000,000 daily active users (DAU)**.
- Each active user uploads **1 photo per day**.
- Each active user views **50 feed pages per day**; each page loads ~10 thumbnail previews.
- Average original photo: **2 MB**. Average thumbnail: **50 KB**.
- Traffic is roughly spread across a 24-hour day (86,400 seconds).
- **Peak** traffic is defined as 5× the daily average, reflecting morning/evening usage spikes.

---

## 2. Estimates

### Daily active users
```
10,000,000 registered users × 10% active = 1,000,000 DAU
```

### Uploads per second
```
Average : 1,000,000 uploads/day ÷ 86,400 s/day ≈ 12 uploads/s
Peak    : 12 × 5                                = 60 uploads/s
```

### Feed views per second
```
Page views/day  : 1,000,000 users × 50 pages         = 50,000,000 page views/day
Average         : 50,000,000 ÷ 86,400                ≈ 579 page views/s
Peak            : 579 × 5                             ≈ 2,895 page views/s

Thumbnail requests (10 per page):
  Average       : 579 × 10  ≈  5,790 thumbnail requests/s
  Peak          : 2,895 × 10 ≈ 28,950 thumbnail requests/s
```

### Photo storage per year
```
Originals  : 1,000,000 photos/day × 2 MB     =  2,000,000 MB/day  ≈  2.00 TB/day
Thumbnails : 1,000,000 photos/day × 0.05 MB  =     50,000 MB/day  ≈  0.05 TB/day

Total/day  ≈ 2.05 TB
Total/year ≈ 2.05 TB × 365                   ≈ 748 TB  ≈ 0.75 PB/year
```

---

## 3. Read-heavy or Write-heavy?

**Read-heavy.** Thumbnail reads run at ~5,790/s on average versus ~12 uploads/s — roughly a **480 : 1 read-to-write ratio**.

**What this means for the design:**
- The bottleneck is serving reads fast, not persisting writes.
- A CDN should absorb the bulk of thumbnail traffic at the edge before it ever reaches the origin.
- A cache (e.g. Redis) should store pre-computed feeds and hot metadata so the database is not hit on every page load.
- Read replicas let the database scale reads horizontally without putting pressure on the primary.
- App servers and the database primary only need to handle writes plus cache-miss reads — a far smaller workload.

---

## 4. Why Not Store Photos in the Database?

Storing binary photo files inside a relational database is a common mistake. The reasons to avoid it:

- **Size mismatch.** Databases are optimised for small, structured rows. Storing millions of 2 MB blobs bloats the database to hundreds of terabytes, slowing every index scan, backup, and replication event.
- **Cost.** Database storage (SSD-backed, replicated) is orders of magnitude more expensive per GB than object storage.
- **Throughput.** Streaming a 2 MB file through a database connection consumes a connection slot for far longer than a metadata lookup. Under load this starves the database of connections for real queries.
- **No CDN integration.** A CDN cannot cache a file that lives inside a database query; it can only cache files served from a URL.

**Where they should go instead:** a dedicated **object storage service** (such as Amazon S3, Google Cloud Storage, or any S3-compatible store). Object storage is designed for large binary files, is virtually infinitely scalable, is cheap per GB, and serves files over HTTP URLs that CDNs can cache natively.

---

## 5. Architecture Diagram

```
                   ┌──────────────────────────────────────────┐
                   │               CLIENTS                    │
                   │       (mobile apps, web browsers)        │
                   └──────────────────┬───────────────────────┘
                                      │ HTTPS
                                      ▼
                   ┌──────────────────────────────────────────┐
                   │                 CDN                      │
                   │   (caches thumbnails & static assets     │
                   │    at edge nodes close to the user)      │
                   └──────────────────┬───────────────────────┘
                                      │ cache miss only
                                      ▼
                   ┌──────────────────────────────────────────┐
                   │            Load Balancer                 │
                   └──────────┬───────────────┬──────────────-┘
                              │               │
                  ┌───────────▼───┐   ┌───────▼───────┐
                  │  App Server 1 │   │  App Server 2 │  ← scale out as needed
                  └───────┬───────┘   └───────┬───────┘
                          │                   │
           ┌──────────────┼───────────────────┤
           │              │                   │
           ▼              ▼                   ▼
  ┌────────────┐   ┌─────────────┐   ┌─────────────────────┐
  │   Cache    │   │    Queue    │   │  Primary Database   │
  │  (Redis)   │   │ (RabbitMQ / │   │   (PostgreSQL)      │
  │            │   │  SQS)       │   │  users, follows,    │
  └────────────┘   └──────┬──────┘   │  photo metadata     │
                          │          └──────────┬──────────-┘
                          ▼                     │ replication
                  ┌───────────────┐   ┌─────────▼──────────┐
                  │   Thumbnail   │   │   Read Replica     │
                  │    Worker     │   │   (PostgreSQL)     │
                  └───────┬───────┘   └────────────────────┘
                          │
                          ▼
                  ┌───────────────────────────┐
                  │      Object Storage       │
                  │  (S3-compatible)          │
                  │  originals + thumbnails   │
                  └───────────────────────────┘
```

---

## 6. Component Explanations

| Component | Problem it solves |
|---|---|
| **CDN** | Serves thumbnails and static assets from edge nodes near the user, absorbing ~90% of read traffic before it reaches the origin servers. |
| **Load Balancer** | Distributes incoming requests evenly across app servers so no single instance becomes a bottleneck and the fleet can scale horizontally. |
| **App Servers** | Handle business logic (auth, feed generation, upload coordination); they are stateless so new instances can be added at any time without coordination. |
| **Cache (Redis)** | Stores pre-computed feed results and hot photo metadata in memory, preventing the database from being queried on every feed page load. |
| **Primary Database** | Single source of truth for all writes — user accounts, follow relationships, photo metadata — with ACID guarantees to prevent data loss or corruption. |
| **Read Replica** | Handles the heavy read traffic (feed queries, profile lookups) so the primary database can dedicate its I/O capacity to writes. |
| **Queue** | Decouples the upload HTTP response from the slow thumbnail-generation work, letting the app server acknowledge the upload in milliseconds. |
| **Thumbnail Worker** | Consumes jobs from the queue, generates thumbnails from original photos, and writes them to object storage without blocking the upload path. |
| **Object Storage** | Stores photo binaries (originals and thumbnails) cheaply and durably at any scale, served over HTTP URLs that the CDN can cache directly. |

---

## 7. Upload Flow (Step by Step)

1. The client selects a photo and sends it — along with metadata (caption, timestamp) — to the **Load Balancer** over HTTPS.
2. The Load Balancer forwards the request to an available **App Server**.
3. The App Server authenticates the user and validates the request.
4. The App Server uploads the original photo binary to **Object Storage** and receives back a unique storage key (URL).
5. The App Server writes a new row to the **Primary Database**: owner ID, caption, storage key, status = `processing`.
6. The App Server publishes a thumbnail-generation job — containing the storage key — to the **Queue**, then immediately returns `201 Created` to the client.
7. A **Thumbnail Worker** picks up the job from the Queue, fetches the original from Object Storage, resizes it to 50 KB, and writes the thumbnail back to Object Storage under a thumbnail key.
8. The Worker updates the photo row in the Primary Database: thumbnail key added, status = `ready`.
9. When a follower loads their feed, the **App Server** queries the **Read Replica** (or **Cache**) for photo metadata, assembles a list of thumbnail URLs, and returns them to the client.
10. The client requests each thumbnail URL; the **CDN** serves it from an edge node (or fetches it from Object Storage on first request and caches it for subsequent ones).

---

## 8. Trade-offs

### Trade-off 1: Eventual consistency in the feed vs. simplicity
Using a read replica and a Redis cache means a follower may see a newly uploaded photo a few seconds after it was posted rather than instantly. This is called **eventual consistency** and is acceptable for a social feed — nobody is harmed by a two-second delay. The benefit is that the primary database is shielded from read traffic, keeping write latency low even at peak. A system that required immediate consistency (e.g. a banking ledger) would need a different approach, such as always reading from the primary, which would not scale here.

### Trade-off 2: Asynchronous thumbnail generation vs. immediate availability
Generating thumbnails in a background worker means the photo does not appear in followers' feeds the moment the upload completes — the client must wait for the worker to finish and the status to become `ready`. The trade-off is worthwhile: the upload HTTP response is fast (no blocking image processing), the app server is not tied up during CPU-heavy resize operations, and the queue absorbs traffic spikes without dropping jobs. The alternative — generating thumbnails synchronously during the upload — would simplify the architecture but would slow every upload response and risk timeouts on large files under load.
