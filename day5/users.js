const loadBtn     = document.getElementById("load-users");
const filterInput = document.getElementById("filter-input");
const statusEl    = document.getElementById("status");
const usersList   = document.getElementById("users-list");

const API_URL = "https://jsonplaceholder.typicode.com/users";

let allUsers = [];

function renderUsers(list) {
  usersList.innerHTML = "";

  if (list.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No users match your filter.";
    usersList.appendChild(empty);
    return;
  }

  for (const user of list) {
    const li = document.createElement("li");

    const name = document.createElement("p");
    name.className = "user-name";
    name.textContent = user.name;

    const email = document.createElement("p");
    email.className = "user-detail";
    email.textContent = `Email: ${user.email}`;

    const city = document.createElement("p");
    city.className = "user-detail";
    city.textContent = `City: ${user.address.city}`;

    const company = document.createElement("p");
    company.className = "user-detail";
    company.textContent = `Company: ${user.company.name}`;

    li.appendChild(name);
    li.appendChild(email);
    li.appendChild(city);
    li.appendChild(company);
    usersList.appendChild(li);
  }
}

async function loadUsers() {
  loadBtn.disabled = true;
  statusEl.textContent = "Loading…";
  usersList.innerHTML = "";
  allUsers = [];

  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error(`Server error: ${response.status} ${response.statusText}`);
    }

    allUsers = await response.json();
    statusEl.textContent = `${allUsers.length} users loaded.`;
    renderUsers(allUsers);
  } catch (error) {
    statusEl.textContent = `Error: ${error.message}`;
  } finally {
    loadBtn.disabled = false;
  }
}

filterInput.addEventListener("input", () => {
  const query = filterInput.value.toLowerCase();
  const filtered = allUsers.filter(user =>
    user.name.toLowerCase().includes(query)
  );
  renderUsers(filtered);
});

loadBtn.addEventListener("click", loadUsers);
