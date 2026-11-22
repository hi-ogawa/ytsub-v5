// The attribute comes off once the flash ends or is cancelled. Otherwise hiding
// the tab with `display: none` and showing it again replays the flash.
export function flashHighlight(element: HTMLElement) {
  element.dataset.flash = "";
  const animation = element
    .getAnimations()
    .find(
      (a) => a instanceof CSSAnimation && a.animationName === "flash-highlight",
    );
  if (!animation) {
    return;
  }
  animation.currentTime = 0;
  const remove = () => delete element.dataset.flash;
  animation.finished.then(remove, remove);
}
