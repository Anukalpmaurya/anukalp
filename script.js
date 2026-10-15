
const $ = (id) => document.getElementById(id);

const form = $("productForm");
const createView = $("createView");
const historyView = $("historyView");

let currentListing = null;
let lastProduct = null;

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem("hustleai-history") || "[]");
  } catch {
    return [];
  }
}

function saveHistory(items) {
  localStorage.setItem("hustleai-history", JSON.stringify(items));
  updateCount();
}

function updateCount() {
  $("totalCount").textContent = getHistory().length;
}

function showView(view) {
  const isHistory = view === "history";
  createView.classList.toggle("hidden", isHistory);
  historyView.classList.toggle("hidden", !isHistory);

  $("createNav").classList.toggle("active", !isHistory);
  $("historyNav").classList.toggle("active", isHistory);

  $("pageTitle").innerHTML = isHistory
    ? 'Your ideas, <span class="gradient-text">all in one place.</span>'
    : 'Make your product <span class="gradient-text">stand out.</span>';

  $("pageSubtitle").textContent = isHistory
    ? "Manage and reuse your generated product content."
    : "Turn product details into marketing content in seconds.";

  if (isHistory) renderHistory();
}

$("createNav").addEventListener("click", () => showView("create"));
$("historyNav").addEventListener("click", () => showView("history"));

function getProduct() {
  return {
    name: $("productName").value.trim(),
    category: $("category").value,
    price: $("price").value,
    features: $("features").value.trim(),
    audience: $("audience").value.trim(),
    tone: document.querySelector('input[name="tone"]:checked').value,
    platform: $("platform").value
  };
}

function setLoading(loading) {
  $("emptyState").classList.toggle("hidden", loading || Boolean(currentListing));
  $("results").classList.toggle("hidden", loading || !currentListing);
  $("loadingState").classList.toggle("hidden", !loading);
  $("generateBtn").disabled = loading;
  $("generateBtn").innerHTML = loading
    ? '<span>✦</span> Creating your listing...'
    : '<span>✦</span> Generate my listing <span class="btn-arrow">→</span>';
}

function normalizeListing(data, product) {
  // Accept either structured JSON or text returned by a model.
  if (data && typeof data === "object" && data.title) {
    return {
      title: data.title,
      description: data.description || "",
      caption: data.caption || "",
      hashtags: data.hashtags || "",
      cta: data.cta || ""
    };
  }

  if (data && typeof data === "object" && data.response) {
    data = data.response;
  }

  const text = String(data || "").trim();
  if (!text) throw new Error("The AI returned an empty response. Try again.");

  // The prompt requests JSON. This also handles JSON wrapped in code fences.
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed.title) return normalizeListing(parsed, product);
  } catch {
    // If the model doesn't return JSON, show its response as the description.
  }

  return {
    title: product.name,
    description: text,
    caption: "",
    hashtags: "",
    cta: ""
  };
}

function renderListing(listing) {
  $("outTitle").textContent = listing.title;
  $("outDescription").textContent = listing.description;
  $("outCaption").textContent = listing.caption;
  $("outHashtags").textContent = Array.isArray(listing.hashtags)
    ? listing.hashtags.join(" ")
    : listing.hashtags;
  $("outCta").textContent = listing.cta;
  $("resultCategory").textContent = lastProduct.category.toUpperCase();
  $("resultTime").textContent = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

  $("results").classList.remove("hidden");
  $("emptyState").classList.add("hidden");
}

async function checkConnection() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();

    $("connectionStatus").textContent = data.model
      ? `Connected · ${data.model}`
      : "Server online · AI unavailable";

    if (!data.model) {
      $("connectionStatus").textContent = "Model not detected";
    }
  } catch {
    $("connectionStatus").textContent = "Start the local server";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await generateListing();
});

$("regenerateBtn").addEventListener("click", generateListing);

async function generateListing() {
  if (!form.reportValidity()) return;

  lastProduct = getProduct();
  currentListing = null;
  $("message").textContent = "";
  setLoading(true);

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lastProduct)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to generate content.");
    }

    currentListing = normalizeListing(data, lastProduct);
    renderListing(currentListing);
    $("message").textContent = "";
  } catch (error) {
    $("message").textContent =
      `${error.message} Check that Ollama and the local server are running.`;
  } finally {
    setLoading(false);
  }
}

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const target = $(button.dataset.copy);
    const original = button.textContent;

    try {
      await navigator.clipboard.writeText(target.textContent);
      button.textContent = "Copied!";
      setTimeout(() => button.textContent = original, 1200);
    } catch {
      $("message").textContent =
        "Copy failed. Select the text and copy it manually.";
    }
  });
});

$("saveBtn").addEventListener("click", () => {
  if (!currentListing || !lastProduct) return;

  const history = getHistory();
  history.unshift({
    id: crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`,
    product: lastProduct,
    listing: currentListing,
    createdAt: new Date().toISOString()
  });

  // Keep the most recent 50 listings.
  saveHistory(history.slice(0, 50));
  $("saveBtn").textContent = "✓ Saved successfully";
  setTimeout(() => $("saveBtn").textContent = "♡ Save listing", 1500);
});

function renderHistory() {
  const history = getHistory();
  const container = $("historyList");
  container.replaceChildren();

  if (!history.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "No saved listings yet. Generate your first listing!";
    container.appendChild(empty);
    return;
  }

  history.forEach((item) => {
    const card = document.createElement("article");
    card.className = "history-item";

    const info = document.createElement("div");
    const title = document.createElement("h3");
    const description = document.createElement("p");

    title.textContent = item.product.name;
    description.textContent =
      `${item.product.category} · ${new Date(item.createdAt).toLocaleDateString()}`;

    info.append(title, description);

    const actions = document.createElement("div");
    actions.className = "history-buttons";

    const open = document.createElement("button");
    open.textContent = "Open";
    open.addEventListener("click", () => {
      lastProduct = item.product;
      currentListing = item.listing;

      $("productName").value = item.product.name;
      $("category").value = item.product.category;
      $("price").value = item.product.price || "";
      $("features").value = item.product.features;
      $("audience").value = item.product.audience || "";
      $("platform").value = item.product.platform;

      const tone = document.querySelector(
        `input[name="tone"][value="${CSS.escape(item.product.tone)}"]`
      );
      if (tone) tone.checked = true;

      showView("create");
      setLoading(false);
      renderListing(currentListing);
    });

    const remove = document.createElement("button");
    remove.textContent = "Delete";
    remove.addEventListener("click", () => {
      saveHistory(getHistory().filter((saved) => saved.id !== item.id));
      renderHistory();
    });

    actions.append(open, remove);
    card.append(info, actions);
    container.appendChild(card);
  });
}

updateCount();
checkConnection();
