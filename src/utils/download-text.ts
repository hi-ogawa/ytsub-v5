export function downloadText(options: {
  filename: string;
  text: string;
  type: string;
}): void {
  const blob = new Blob([options.text], { type: options.type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = options.filename;
  link.click();
  URL.revokeObjectURL(url);
}
