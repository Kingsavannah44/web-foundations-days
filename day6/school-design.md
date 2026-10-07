# School Database Design

## Tables

### students
Stores one row per person enrolled at the school. The `email` column has a `UNIQUE` constraint because no two students can share an email address. Every row must have a `name` and an `email` (`NOT NULL`).

### courses
Stores one row per course offered. Each course has a `title` and an `instructor` name. Both columns are `NOT NULL` because a course without a title or a teacher would not make sense.

### enrolments
Acts as a **join table** linking students to courses. It holds the optional `grade` that a student receives on a particular course. Foreign keys reference `students(id)` and `courses(id)`, and a `UNIQUE` constraint on `(student_id, course_id)` prevents the same student from being enrolled on the same course twice.

---

## Relationships

- **students → enrolments** is **one-to-many**: one student can have many enrolment records, but each enrolment record belongs to exactly one student.
- **courses → enrolments** is **one-to-many**: one course can appear in many enrolment records, but each enrolment record points to exactly one course.
- **students ↔ courses** is **many-to-many**: a student can be enrolled on many courses, and a course can have many students. A direct link between the two tables is not possible in a relational database, so a join table (`enrolments`) is required. The join table holds the foreign keys for both sides and can also carry extra data specific to the relationship — in this case, the `grade`.

---

## Index Recommendation

```sql
CREATE INDEX idx_enrolments_student_id ON enrolments(student_id);
```

**Reason:** The most common query pattern is "find all courses for a given student", which filters `enrolments` by `student_id`. Without an index, SQLite must scan every row in the table. With this index, it can jump directly to the matching rows, which becomes noticeably faster as the number of enrolments grows.

---

## SQL vs NoSQL

For this system I would choose **SQL (a relational database such as SQLite or PostgreSQL)**. The data is clearly structured and the relationships between entities are fixed: a student has many enrolments, and each enrolment belongs to exactly one course. Relational databases enforce these relationships through foreign keys and constraints, which prevents bad data from ever being inserted. Queries that span multiple tables — such as listing all students on a course or counting enrolments per course — are expressed cleanly and efficiently with `JOIN` and `GROUP BY`. A NoSQL document store would require either duplicating data across documents or doing the joining in application code, which adds complexity and risks inconsistency. SQL is therefore the right tool when the schema is stable and data integrity matters.
