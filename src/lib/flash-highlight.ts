// The attribute comes off once the flash ends or is cancelled. Otherwise hiding
// the tab with `display: none` and showing it again replays the flash.
export function flashHighlight(el: HTMLElement) {
  el.dataset.flash = "";
  const animation = el
    .getAnimations()
    .find(
      (a) => a instanceof CSSAnimation && a.animationName === "flash-highlight",
    );
  if (!animation) {
    return;
  }
  animation.currentTime = 0;
  const remove = () => delete el.dataset.flash;
  animation.finished.then(remove, remove);
}
