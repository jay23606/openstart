export function createContentController({ documentRef = document }) {
  function updateCount() {
    const visible = documentRef.querySelectorAll("[data-help-article]:not(.hidden)").length;
    const count = documentRef.querySelector(".help-count");
    if (count) count.textContent = `${visible} guide${visible === 1 ? "" : "s"}`;
  }

  function handleClick(target) {
    if (!target.matches("[data-help-filter]")) return false;
    const searchInput = documentRef.querySelector("[data-help-search]");
    if (searchInput) searchInput.value = "";
    documentRef.querySelectorAll("[data-help-filter]").forEach((button) => {
      button.classList.toggle("active", button === target);
    });
    const audience = target.dataset.helpFilter;
    documentRef.querySelectorAll("[data-help-article]").forEach((article) => {
      article.classList.toggle("hidden", audience !== "All" && article.dataset.helpAudience !== audience);
    });
    updateCount();
    return true;
  }

  function handleInput(target) {
    if (!target.matches("[data-help-search]")) return false;
    const search = target.value.trim().toLowerCase();
    documentRef.querySelectorAll("[data-help-filter]").forEach((button) => {
      button.classList.toggle("active", button.dataset.helpFilter === "All");
    });
    documentRef.querySelectorAll("[data-help-article]").forEach((article) => {
      article.classList.toggle("hidden", Boolean(search && !article.dataset.helpSearchable.includes(search)));
    });
    updateCount();
    return true;
  }

  return { handleClick, handleInput };
}
