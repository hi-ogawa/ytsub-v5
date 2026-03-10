(function () {
  var t = localStorage.getItem("zamak:theme");
  var dark =
    t === "dark" ||
    (t !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  if (dark) document.documentElement.classList.add("dark");
})();
