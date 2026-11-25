// The attribute comes off once the flash ends or is cancelled. Otherwise hiding
// the element with `display: none` and showing it again replays the flash.
// A hidden tab keeps its flashes running, so a new flash ends any other in the
// same list, rather than showing both when the tab is shown again.
export function flashHighlight(element: HTMLElement) {
  const others =
    element.parentElement?.querySelectorAll<HTMLElement>(
      ":scope > [data-flash]",
    ) ?? [];
  for (const other of others) {
    delete other.dataset.flash;
  }
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
