# Course Reflection

## What was the most difficult concept, and how did I overcome it?

The most difficult concept was understanding **concurrency and race conditions** — specifically, how two users can simultaneously try to buy the same seat and why application-level checks are not enough to stop it. At first, it felt like a problem you could solve with a simple `if` statement: check whether the seat is available, then sell it. The issue only became clear when I thought through what happens when two requests arrive at the same millisecond: both checks pass, both proceed, and the seat is sold twice. The breakthrough came from understanding that the database itself serialises writes through row-level locking, and that an atomic `UPDATE … WHERE status = 'available'` is the correct solution — not application code. Reading about database transactions and practising the SQL helped cement it.

## Which part of my capstone would I improve?

Based on the feedback received, I would improve the **API design section**. The endpoints I defined cover the happy path well, but I did not spend enough time thinking through error responses and edge cases — for example, what happens if a payment token expires between reservation and confirmation, or if a user tries to reserve more seats than are left. A stronger API design would include a complete error-code table for each endpoint and a brief note on idempotency for the confirm-purchase call, so that a network retry does not charge the user twice.

## What will I learn next?

I want to go deeper on **backend development** — specifically building a real REST API with Node.js and Express, connecting it to a PostgreSQL database, and writing proper authentication with JWTs. The design work in this course gave me a solid mental model of how systems fit together; the next step is to build one end-to-end and feel the practical constraints that diagrams can only hint at.
