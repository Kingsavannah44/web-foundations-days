const textarea     = document.getElementById("note-text");
const charCount    = document.getElementById("char-count");
const wordCount    = document.getElementById("word-count");
const clearBtn     = document.getElementById("clear-btn");
const themeToggle  = document.getElementById("theme-toggle");

const DRAFT_KEY = "day4-draft";
const THEME_KEY = "day4-theme";
const CHAR_LIMIT = 200;
const WARN_AT    = 180;

function updateCounts() {
  const text = textarea.value;
  const chars = text.length;
  const words = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;

  charCount.textContent = `${chars} / ${CHAR_LIMIT} characters`;
  wordCount.textContent = `${words} word${words !== 1 ? "s" : ""}`;

  charCount.classList.remove("warning", "over");
  if (chars > CHAR_LIMIT) {
    charCount.classList.add("over");
  } else if (chars > WARN_AT) {
    charCount.classList.add("warning");
  }
}

function clearAll() {
  textarea.value = "";
  localStorage.removeItem(DRAFT_KEY);
  updateCounts();
}

textarea.addEventListener("input", () => {
  updateCounts();
  localStorage.setItem(DRAFT_KEY, textarea.value);
});

textarea.addEventListener("keydown", (e) => {
  if (e.key === "Escape") clearAll();
});

clearBtn.addEventListener("click", clearAll);

themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("dark");
  const isDark = document.body.classList.contains("dark");
  themeToggle.textContent = isDark ? "Light mode" : "Dark mode";
  localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
});

(function restore() {
  const savedDraft = localStorage.getItem(DRAFT_KEY);
  if (savedDraft) textarea.value = savedDraft;

  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme === "dark") {
    document.body.classList.add("dark");
    themeToggle.textContent = "Light mode";
  }

  updateCounts();
})();
