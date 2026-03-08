import svgRaw from "../../public/favicon.svg?raw";

export function AppIcon({
  size,
  background = true,
  fill,
}: {
  size: number;
  background?: boolean;
  fill?: string;
}) {
  let svg = svgRaw
    .replace(/width="\d+"/, `width="${size}"`)
    .replace(/height="\d+"/, `height="${size}"`);
  if (!background) {
    svg = svg.replace(/<rect[^/]*\/>/, "");
  }
  if (fill) {
    svg = svg.replaceAll(/fill="white"/g, `fill="${fill}"`);
  }
  return <span dangerouslySetInnerHTML={{ __html: svg }} />;
}
