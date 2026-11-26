import "./style.css";
import "./video.js";
import { addImages } from "./image.js";

const tabs = document.querySelectorAll("[role=tab]");

function showTab(name) {
  tabs.forEach((t) => {
    const on = t.dataset.tab === name;
    t.setAttribute("aria-selected", on);
    document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
  });
}

tabs.forEach((t) =>
  t.addEventListener("click", () => {
    history.replaceState(null, "", `#${t.dataset.tab}`);
    showTab(t.dataset.tab);
  }),
);
const fromHash = () => showTab(location.hash === "#image" ? "image" : "video");
window.addEventListener("hashchange", fromHash);
fromHash();

// Ctrl+V a screenshot or copied image straight into the image tool.
window.addEventListener("paste", (e) => {
  const imgs = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
  if (!imgs.length) return;
  showTab("image");
  addImages(imgs);
});
