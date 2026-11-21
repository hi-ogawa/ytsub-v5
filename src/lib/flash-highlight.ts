// The class comes off once the flash ends or is cancelled. Otherwise hiding
// the tab with `display: none` and showing it again replays the flash.
export function flashHighlight(el: HTMLElement) {
  el.classList.add("flash-highlight");
  const animation = el
    .getAnimations()
    .find(
      (a) => a instanceof CSSAnimation && a.animationName === "flash-highlight",
    );
  if (!animation) {
    return;
  }
  animation.currentTime = 0;
  const remove = () => el.classList.remove("flash-highlight");
  animation.finished.then(remove, remove);
}
