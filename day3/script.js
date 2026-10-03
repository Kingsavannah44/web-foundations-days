let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

// ── searchNotes ──────────────────────────────────────────────────────────────
function searchNotes(word) {
  return notes.filter(note => note.text.toLowerCase().includes(word.toLowerCase()));
}

// ── longestNote ──────────────────────────────────────────────────────────────
function longestNote() {
  if (notes.length === 0) return null;
  let longest = notes[0];
  for (let i = 1; i < notes.length; i++) {
    if (notes[i].text.length > longest.text.length) {
      longest = notes[i];
    }
  }
  return longest;
}

// ── countByCategory ──────────────────────────────────────────────────────────
function countByCategory() {
  const counts = {};
  for (const note of notes) {
    counts[note.category] = (counts[note.category] || 0) + 1;
  }
  return counts;
}

// ── getSummary ───────────────────────────────────────────────────────────────
function getSummary() {
  const counts = countByCategory();
  const parts = Object.entries(counts)
    .map(([category, count]) => `${count} ${category}`)
    .join(", ");
  const word = notes.length === 1 ? "note" : "notes";
  return `${notes.length} ${word}: ${parts}.`;
}

// ── isDuplicate ──────────────────────────────────────────────────────────────
function isDuplicate(text) {
  const normalised = text.trim().toLowerCase();
  return notes.some(note => note.text.trim().toLowerCase() === normalised);
}

// ── addNote ──────────────────────────────────────────────────────────────────
function addNote(text, category) {
  const VALID_CATEGORIES = ["personal", "work", "study"];
  const trimmed = text.trim();

  if (trimmed.length < 1 || trimmed.length > 200) {
    console.log("addNote failed: text must be between 1 and 200 characters.");
    return false;
  }
  if (isDuplicate(text)) {
    console.log(`addNote failed: "${trimmed}" is a duplicate.`);
    return false;
  }
  if (!VALID_CATEGORIES.includes(category)) {
    console.log(`addNote failed: "${category}" is not a valid category.`);
    return false;
  }

  const newId = notes.length > 0 ? Math.max(...notes.map(n => n.id)) + 1 : 1;
  notes.push({ id: newId, text: trimmed, category });
  return true;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log("=== searchNotes ===");
console.log(searchNotes("day"));        // [{ id: 2, text: "Finish the Day 3 assignment", category: "study" }]
console.log(searchNotes("xyz"));        // []

console.log("\n=== longestNote ===");
console.log(longestNote());             // { id: 3, text: "Email the project report to Grace", category: "work" }
notes.length = 0;
console.log(longestNote());             // null
notes.push(
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" }
);

console.log("\n=== countByCategory ===");
console.log(countByCategory());         // { personal: 2, work: 1, study: 2 }

console.log("\n=== getSummary ===");
console.log(getSummary());              // "5 notes: 2 personal, 1 work, 2 study."
const saved = notes.splice(1);
console.log(getSummary());              // "1 note: 1 personal."
notes.push(...saved);

console.log("\n=== isDuplicate ===");
console.log(isDuplicate("Call mum"));   // true
console.log(isDuplicate("Call dad"));   // false

console.log("\n=== addNote ===");
console.log(addNote("Read Clean Code", "study"));        // true
console.log(addNote("Buy milk and bread", "personal"));  // false  (duplicate)
console.log(addNote("", "work"));                        // false  (empty text)
console.log(addNote("Go for a walk", "hobby"));          // false  (bad category)

console.log("\nFinal notes array:");
console.log(notes);

console.log("\n=== Updated summary ===");
console.log(getSummary());              // "6 notes: 2 personal, 1 work, 3 study."
