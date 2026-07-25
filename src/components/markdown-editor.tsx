import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, ImagePlus, Save } from "lucide-react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { getApiBaseUrl } from "@/lib/api-config";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void | Promise<void>;
  saving?: boolean;
}

export function MarkdownEditor({ value, onChange, onSave, saving }: Props) {
  const [preview, setPreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const insertAtCursor = (snippet: string) => {
    const el = textareaRef.current;
    if (!el) {
      onChange(value + snippet);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = value.slice(0, start) + snippet + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + snippet.length;
    });
  };

  const onUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api<{ imageName: string }>("/image", {
        method: "POST",
        auth: true,
        raw: true,
        body: fd,
      });
      const url = `${getApiBaseUrl()}/image/${res.imageName}`;
      insertAtCursor(`![${file.name}](${url})`);
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border p-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            <ImagePlus className="mr-2 h-4 w-4" />
            {uploading ? "Uploading…" : "Image"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPreview((p) => !p)}
          >
            {preview ? (
              <>
                <EyeOff className="mr-2 h-4 w-4" />
                Edit
              </>
            ) : (
              <>
                <Eye className="mr-2 h-4 w-4" />
                Preview
              </>
            )}
          </Button>
        </div>
        <Button type="button" size="sm" onClick={onSave} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Saving…" : "Save content"}
        </Button>
      </div>

      <div className="flex-1 overflow-hidden">
        {preview ? (
          <div className="prose prose-sm dark:prose-invert h-full max-w-none overflow-auto p-4">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {value || "*Nothing to preview.*"}
            </ReactMarkdown>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-full w-full resize-none bg-background p-4 font-mono text-sm outline-none"
            spellCheck={false}
            placeholder="# Write your post in markdown…"
          />
        )}
      </div>
    </div>
  );
}
