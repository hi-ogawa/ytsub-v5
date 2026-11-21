export function downloadText(options: {
  filename: string;
  text: string;
  type: string;
}): void {
  const blob = new Blob([options.text], { type: options.type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = options.filename;
  a.click();
  URL.revokeObjectURL(url);
}
