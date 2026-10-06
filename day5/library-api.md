# Library Books REST API

Base URL: `/api`

---

## Endpoints

### 1. List all books

- **Method:** `GET`
- **Path:** `/books`
- **Description:** Returns an array of all books in the library.
- **Success status:** `200 OK`

---

### 2. Get a single book

- **Method:** `GET`
- **Path:** `/books/:id`
- **Description:** Returns the book with the given ID.
- **Success status:** `200 OK`

---

### 3. Create a book

- **Method:** `POST`
- **Path:** `/books`
- **Description:** Adds a new book to the library.
- **Example request body:**
  ```json
  {
    "title": "The Great Gatsby",
    "author": "F. Scott Fitzgerald",
    "year": 1925,
    "genre": "Fiction"
  }
  ```
- **Success status:** `201 Created`

---

### 4. Update a book

- **Method:** `PUT`
- **Path:** `/books/:id`
- **Description:** Replaces all fields of the book with the given ID.
- **Example request body:**
  ```json
  {
    "title": "The Great Gatsby",
    "author": "F. Scott Fitzgerald",
    "year": 1925,
    "genre": "Classic Fiction"
  }
  ```
- **Success status:** `200 OK`

---

### 5. Delete a book

- **Method:** `DELETE`
- **Path:** `/books/:id`
- **Description:** Permanently removes the book with the given ID.
- **Success status:** `204 No Content`

---

### 6. List books by author

- **Method:** `GET`
- **Path:** `/books?author=<name>`
- **Description:** Returns all books whose author field contains the given name (case-insensitive).
- **Example:** `GET /books?author=tolkien`
- **Success status:** `200 OK`

---

## Error Codes

| Code | Meaning | Example |
|------|---------|---------|
| `400 Bad Request` | The request body is missing required fields or contains invalid data. | Sending a `POST /books` request without a `title` field. |
| `404 Not Found` | The requested resource does not exist. | Calling `GET /books/999` when no book with ID 999 exists. |
