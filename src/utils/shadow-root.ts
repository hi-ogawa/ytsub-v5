// Creates a host element with an open shadow root holding the given CSS, and
// returns the container to render into.
export function createShadowHost({
  id,
  css,
  style,
}: {
  id: string;
  css: string;
  style: Partial<CSSStyleDeclaration>;
}) {
  // Inline styles here because `all: initial` resets everything and
  // inline styles beat :host stylesheet rules. Use :host in the CSS
  // only for CSS custom properties (unaffected by `all: initial`).
  const host = document.createElement("div");
  host.id = id;
  Object.assign(host.style, { all: "initial", ...style });
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  addShadowStyle(shadow, css);

  const container = document.createElement("div");
  shadow.appendChild(container);

  return { host, container };
}

// Inject CSS into shadow root, hoisting @property declarations to document head
// because @property doesn't work inside Shadow DOM <style> elements.
// https://github.com/tailwindlabs/tailwindcss/issues/15005#issuecomment-3891099776
function addShadowStyle(shadow: ShadowRoot, css: string) {
  const processed = css.replaceAll(":root", ":host");

  const propertyRules: string[] = [];
  const shadowCss = processed.replace(
    /@property\s+[^{]+\{[^}]*\}/g,
    (match) => {
      propertyRules.push(match);
      return "";
    },
  );

  if (propertyRules.length > 0) {
    const propStyle = document.createElement("style");
    propStyle.textContent = propertyRules.join("\n");
    document.head.appendChild(propStyle);
  }

  const style = document.createElement("style");
  style.textContent = shadowCss;
  shadow.appendChild(style);
}
