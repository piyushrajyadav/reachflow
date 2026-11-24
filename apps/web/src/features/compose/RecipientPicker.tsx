import { useRef, useState, type DragEvent } from "react";
import { FileText, UploadCloud, X } from "lucide-react";
import toast from "react-hot-toast";
import { parseRecipients, type ParsedRecipients } from "../../lib/recipients";
import { Textarea } from "../../components/ui/Field";
import { cn } from "../../lib/cn";
import { formatNumber } from "../../lib/format";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

interface Props {
  value: ParsedRecipients | null;
  fileName: string | null;
  error?: string;
  onChange: (value: ParsedRecipients | null, fileName: string | null) => void;
}

export function RecipientPicker({ value, fileName, error, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pasting, setPasting] = useState(false);

  async function load(file?: File) {
    if (!file) return;
    if (!/\.(csv|txt)$/i.test(file.name)) return void toast.error("Upload a .csv or .txt file.");
    if (file.size > MAX_FILE_BYTES) return void toast.error("That file is larger than 5 MB.");
    const parsed = parseRecipients(await file.text());
    if (!parsed.valid.length) toast.error("No valid email addresses found in that file.");
    onChange(parsed, file.name);
  }

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void load(e.dataTransfer.files[0]);
  };

  return (
    <div>
      {!value ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
          className={cn(
            "flex flex-col items-center rounded-lg border border-dashed px-6 py-8 text-center transition-colors",
            dragging ? "border-brand bg-brand-soft" : error ? "border-danger" : "border-line-strong bg-surface"
          )}
        >
          <UploadCloud className="mb-2 size-6 text-ink-2" />
          <p className="text-sm">
            <button type="button" onClick={() => input.current?.click()} className="font-medium text-brand hover:underline">Choose a CSV or TXT file</button>
            <span className="text-muted"> or drop it here</span>
          </p>
          <p className="mt-1 text-xs text-muted">Any column works. Invalid and duplicate addresses are removed for you.</p>
          <button type="button" onClick={() => setPasting((p) => !p)} className="mt-3 text-xs text-muted underline-offset-2 hover:text-ink hover:underline">
            {pasting ? "Hide paste box" : "Or paste addresses"}
          </button>
          {pasting && (
            <Textarea
              aria-label="Paste email addresses"
              className="mt-3 min-h-24 text-left font-mono text-xs"
              placeholder={"ada@example.com\ngrace@example.com"}
              onChange={(e) => {
                const parsed = parseRecipients(e.target.value);
                if (parsed.valid.length || parsed.invalid.length) onChange(parsed, null);
              }}
            />
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-line-strong bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand"><FileText className="size-4" /></span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{fileName ?? "Pasted addresses"}</p>
                <p className="text-xs text-muted" aria-live="polite">
                  <span className="font-medium text-brand tabular">{formatNumber(value.valid.length)} recipients detected</span>
                  {value.duplicates > 0 && <> · {formatNumber(value.duplicates)} duplicates removed</>}
                  {value.invalid.length > 0 && <span className="text-amber"> · {formatNumber(value.invalid.length)} invalid skipped</span>}
                </p>
              </div>
            </div>
            <button type="button" onClick={() => { onChange(null, null); if (input.current) input.current.value = ""; }} aria-label="Remove recipients" className="rounded-md p-1.5 text-muted hover:bg-ink/5 hover:text-ink">
              <X className="size-4" />
            </button>
          </div>
          {value.valid.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {value.valid.slice(0, 5).map((e) => (
                <li key={e} className="rounded bg-paper px-2 py-1 font-mono text-xs text-ink-2">{e}</li>
              ))}
              {value.valid.length > 5 && <li className="px-1 py-1 text-xs text-muted">+{formatNumber(value.valid.length - 5)} more</li>}
            </ul>
          )}
        </div>
      )}
      <input ref={input} type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" tabIndex={-1} onChange={(e) => void load(e.target.files?.[0])} />
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
}
