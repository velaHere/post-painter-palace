import { useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Button } from "@/components/ui/button";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Minus,
  Link as LinkIcon,
  ImagePlus,
  Code2,
  Table as TableIcon,
  Box,
  ChevronDown,
  CornerDownLeft,
  Eye,
  EyeOff,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { uploadImage } from "@/lib/upload-image";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void | Promise<void>;
  saving?: boolean;
}

type Selection = { start: number; end: number };

export function ContentEditor({ value, onChange, onSave, saving }: Props) {
  const [preview, setPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const getSel = (): Selection => {
    const el = textareaRef.current;
    if (!el) return { start: value.length, end: value.length };
    return { start: el.selectionStart, end: el.selectionEnd };
  };

  const setSel = (start: number, end: number) => {
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.selectionStart = start;
      el.selectionEnd = end;
    });
  };

  const replaceRange = (
    start: number,
    end: number,
    replacement: string,
    caret?: { start: number; end: number },
  ) => {
    const next = value.slice(0, start) + replacement + value.slice(end);
    onChange(next);
    if (caret) setSel(caret.start, caret.end);
    else setSel(start + replacement.length, start + replacement.length);
  };

  const wrap = (before: string, after = before, placeholder = "text") => {
    const { start, end } = getSel();
    const selected = value.slice(start, end) || placeholder;
    const replacement = `${before}${selected}${after}`;
    replaceRange(start, end, replacement, {
      start: start + before.length,
      end: start + before.length + selected.length,
    });
  };

  const prefixLines = (prefix: string | ((i: number) => string)) => {
    const { start, end } = getSel();
    // Expand to full line boundaries
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = value.indexOf("\n", end);
    const stop = lineEnd === -1 ? value.length : lineEnd;
    const block = value.slice(lineStart, stop) || "";
    const lines = block.split("\n");
    const out = lines
      .map((ln, i) => (typeof prefix === "string" ? prefix : prefix(i)) + ln)
      .join("\n");
    replaceRange(lineStart, stop, out);
  };

  const insertAtCaret = (snippet: string, caretOffset?: number) => {
    const { start, end } = getSel();
    const pos = start + (caretOffset ?? snippet.length);
    replaceRange(start, end, snippet, { start: pos, end: pos });
  };

  const insertHeading = (level: number) => {
    prefixLines("#".repeat(level) + " ");
  };

  const insertLink = () => {
    const { start, end } = getSel();
    const selected = value.slice(start, end) || "text";
    const rep = `[${selected}](https://)`;
    replaceRange(start, end, rep, {
      start: start + rep.length - 1,
      end: start + rep.length - 1,
    });
  };

  const insertCodeBlock = () => {
    const { start, end } = getSel();
    const selected = value.slice(start, end) || "code";
    const rep = `\n\`\`\`ts\n${selected}\n\`\`\`\n`;
    replaceRange(start, end, rep);
  };

  const insertTable = () => {
    insertAtCaret(
      `\n| Header | Header |\n| --- | --- |\n| Cell | Cell |\n| Cell | Cell |\n`,
    );
  };

  const insertHtml = (snippet: string, caretOffset?: number) =>
    insertAtCaret(snippet, caretOffset);

  const doUpload = async (file: File) => {
    const toastId = toast.loading(`Uploading ${file.name}…`);
    try {
      const { url } = await uploadImage(file);
      const alt = file.name.replace(/[[\]]/g, "");
      const md = `![${alt}](${url})`;
      // Insert at current caret (or append) using latest textarea state
      const el = textareaRef.current;
      const pos = el ? el.selectionStart : 0;
      const current = el ? el.value : "";
      const next = current.slice(0, pos) + md + current.slice(pos);
      onChange(next);
      setSel(pos + md.length, pos + md.length);
      toast.success(`Uploaded ${file.name}`, { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed", {
        id: toastId,
      });
    }
  };


  const onPaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const images: File[] = [];
    for (const it of Array.from(items)) {
      if (it.kind === "file" && it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) images.push(f);
      }
    }
    if (images.length === 0) return;
    e.preventDefault();
    for (const f of images) await doUpload(f);
  };

  const onDrop = async (e: DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (files.length === 0) return;
    for (const f of files) await doUpload(f);
  };

  const btn = "h-8 w-8 p-0";
  const Div = () => <div className="mx-1 h-5 w-px bg-border" />;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-border p-2">
        {/* Core formatting */}
        <Button variant="ghost" size="sm" className={btn} title="Bold" onClick={() => wrap("**")}>
          <Bold className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className={btn} title="Italic" onClick={() => wrap("*")}>
          <Italic className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className={btn} title="Strikethrough" onClick={() => wrap("~~")}>
          <Strikethrough className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className={btn} title="Inline code" onClick={() => wrap("`")}>
          <Code className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className={btn} title="Heading 1" onClick={() => insertHeading(1)}>
          <Heading1 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className={btn} title="Heading 2" onClick={() => insertHeading(2)}>
          <Heading2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className={btn} title="Heading 3" onClick={() => insertHeading(3)}>
          <Heading3 className="h-4 w-4" />
        </Button>
        <Div />
        {/* Lists & quotes */}
        <Button variant="ghost" size="sm" className={btn} title="Bulleted list" onClick={() => prefixLines("- ")}>
          <List className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className={btn} title="Numbered list" onClick={() => prefixLines((i) => `${i + 1}. `)}>
          <ListOrdered className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className={btn} title="Task list" onClick={() => prefixLines("- [ ] ")}>
          <ListChecks className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className={btn} title="Blockquote" onClick={() => prefixLines("> ")}>
          <Quote className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className={btn} title="Horizontal rule" onClick={() => insertAtCaret("\n\n---\n\n")}>
          <Minus className="h-4 w-4" />
        </Button>
        <Div />
        {/* Links / images / code blocks / table */}
        <Button variant="ghost" size="sm" className={btn} title="Link" onClick={insertLink}>
          <LinkIcon className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className={btn} title="Upload image" onClick={() => fileRef.current?.click()}>
          <ImagePlus className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className={btn} title="Code block" onClick={insertCodeBlock}>
          <Code2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className={btn} title="Table" onClick={insertTable}>
          <TableIcon className="h-4 w-4" />
        </Button>
        <Div />
        {/* HTML helpers */}
        <Button variant="ghost" size="sm" className={btn} title="<div> wrapper" onClick={() => insertHtml('\n<div class="">\n\n</div>\n', 13)}>
          <Box className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className={btn} title="<details> / <summary>" onClick={() => insertHtml("\n<details>\n<summary>Summary</summary>\n\nContent\n\n</details>\n")}>
          <ChevronDown className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className={btn} title="Line break" onClick={() => insertAtCaret("<br />\n")}>
          <CornerDownLeft className="h-4 w-4" />
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreview((p) => !p)}>
            {preview ? <><EyeOff className="mr-2 h-4 w-4" />Edit</> : <><Eye className="mr-2 h-4 w-4" />Preview</>}
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          multiple
          onChange={async (e) => {
            const files = Array.from(e.target.files ?? []);
            for (const f of files) await doUpload(f);
            e.target.value = "";
          }}
        />
      </div>

      <div className="flex-1 overflow-hidden">
        {preview ? (
          <div className="md-preview h-full overflow-auto p-6">
            <MarkdownPreview value={value} />
          </div>

        ) : (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onPaste={onPaste}
            onDrop={onDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            className={`h-full w-full resize-none bg-background p-4 font-mono text-sm leading-relaxed outline-none ${dragging ? "ring-2 ring-primary ring-inset" : ""}`}
            spellCheck={false}
            placeholder="# Write your post in markdown… (paste or drop images to upload)"
          />
        )}
      </div>
    </div>
  );
}
