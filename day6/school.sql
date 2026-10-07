-- ─────────────────────────────────────────────
-- CREATE TABLES
-- ─────────────────────────────────────────────

CREATE TABLE students (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT    NOT NULL,
  email TEXT    NOT NULL UNIQUE
);

CREATE TABLE courses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  instructor  TEXT    NOT NULL
);

CREATE TABLE enrolments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  course_id  INTEGER NOT NULL,
  grade      TEXT,
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (course_id)  REFERENCES courses(id),
  UNIQUE (student_id, course_id)
);

-- ─────────────────────────────────────────────
-- SAMPLE DATA
-- ─────────────────────────────────────────────

INSERT INTO students (name, email) VALUES
  ('Alice Johnson', 'alice@school.com'),
  ('Bob Smith',     'bob@school.com'),
  ('Carol White',   'carol@school.com'),
  ('David Brown',   'david@school.com');

INSERT INTO courses (title, instructor) VALUES
  ('Mathematics',      'Mr. Adams'),
  ('Web Development',  'Ms. Baker'),
  ('Data Science',     'Dr. Clarke');

INSERT INTO enrolments (student_id, course_id, grade) VALUES
  (1, 1, 'A'),
  (1, 2, 'B'),
  (2, 2, 'A'),
  (3, 1, 'C'),
  (3, 3, 'B'),
  (2, 3, NULL);

-- ─────────────────────────────────────────────
-- QUERY 1: All courses for one student (by name)
-- ─────────────────────────────────────────────

SELECT c.title, c.instructor, e.grade
FROM enrolments e
JOIN students s ON s.id = e.student_id
JOIN courses  c ON c.id = e.course_id
WHERE s.name = 'Alice Johnson';

-- ─────────────────────────────────────────────
-- QUERY 2: All students on one course
-- ─────────────────────────────────────────────

SELECT s.name, s.email, e.grade
FROM enrolments e
JOIN students s ON s.id = e.student_id
JOIN courses  c ON c.id = e.course_id
WHERE c.title = 'Web Development';

-- ─────────────────────────────────────────────
-- QUERY 3: Number of students per course
-- ─────────────────────────────────────────────

SELECT c.title, COUNT(e.student_id) AS student_count
FROM courses c
LEFT JOIN enrolments e ON e.course_id = c.id
GROUP BY c.id, c.title;

-- ─────────────────────────────────────────────
-- QUERY 4: Students with no enrolments
-- ─────────────────────────────────────────────

SELECT s.name, s.email
FROM students s
LEFT JOIN enrolments e ON e.student_id = s.id
WHERE e.id IS NULL;

-- ─────────────────────────────────────────────
-- QUERY 5: Update one enrolment's grade
-- ─────────────────────────────────────────────

UPDATE enrolments
SET grade = 'A'
WHERE student_id = (SELECT id FROM students WHERE name = 'Bob Smith')
  AND course_id  = (SELECT id FROM courses  WHERE title = 'Data Science');

-- Verify the update
SELECT s.name, c.title, e.grade
FROM enrolments e
JOIN students s ON s.id = e.student_id
JOIN courses  c ON c.id = e.course_id
WHERE s.name = 'Bob Smith';
