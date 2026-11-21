/**
 * Returns the selection in the tree that contains `node`. Inside a shadow root,
 * Chrome's `document.getSelection()` doesn't see the selected text, so this
 * asks the shadow root instead. `ShadowRoot.getSelection()` is Chromium-only
 * and missing from the DOM types.
 */
export function getSelectionAt(node: Node | null): Selection | null {
  const root = node?.getRootNode();
  if (root && "getSelection" in root) {
    return (
      root as unknown as { getSelection(): Selection | null }
    ).getSelection();
  }
  return document.getSelection();
}
