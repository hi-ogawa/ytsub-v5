import { useRef, useState } from "react";
import { importExportData } from "../lib/caption-session.ts";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog.tsx";

interface ImportData {
  video: { youtubeId: string; title: string; [key: string]: unknown };
  captions: unknown[];
  bookmarks?: unknown[];
}

export function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ImportData>();
  const [parseError, setParseError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");

  function handleFile(file: File) {
    setParseError("");
    setImportError("");
    setParsed(undefined);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (!data.video || !data.captions) {
          setParseError("Invalid format: missing 'video' or 'captions' key.");
          return;
        }
        setParsed(data);
      } catch {
        setParseError("Failed to parse JSON.");
      }
    };
    reader.readAsText(file);
  }

  async function onImport() {
    if (!parsed) return;
    setImporting(true);
    setImportError("");
    try {
      await importExportData(parsed as Parameters<typeof importExportData>[0]);
      onOpenChange(false);
      setParsed(undefined);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Import Video</DialogTitle>

        <div
          className="mb-4 rounded-lg border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground"
          onDragOver={(e) => {
            e.preventDefault();
            e.currentTarget.classList.add("border-ring", "bg-highlight-bg");
          }}
          onDragLeave={(e) => {
            e.currentTarget.classList.remove("border-ring", "bg-highlight-bg");
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.classList.remove("border-ring", "bg-highlight-bg");
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
        >
          <p className="mb-2">
            Drop <code>import.json</code> here or{" "}
            <button
              type="button"
              className="text-accent underline"
              onClick={() => fileRef.current?.click()}
            >
              browse
            </button>
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="hidden"
            data-testid="file-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>

        {parseError && (
          <p className="mb-4 text-sm text-destructive">{parseError}</p>
        )}

        {parsed && (
          <div className="mb-4 rounded border border-border bg-muted p-3 text-sm">
            <p className="font-medium">{parsed.video.title}</p>
            <p className="text-muted-foreground">
              {parsed.captions.length} captions, {parsed.bookmarks?.length ?? 0}{" "}
              bookmarks
            </p>
          </div>
        )}

        {importError && (
          <p className="mb-4 text-sm text-destructive">
            Import failed: {importError}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!parsed || importing}
            className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
            onClick={onImport}
          >
            {importing ? "Importing..." : "Import"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
