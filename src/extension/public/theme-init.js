(function () {
  var t;
  try {
    t = JSON.parse(localStorage.getItem("zamak:theme")).theme;
  } catch {}
  var dark =
    t === "dark" ||
    (t !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  if (dark) {
    document.documentElement.classList.add("dark");
  }
})();
