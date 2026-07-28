import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, ImageOff } from "lucide-react";
import { uploadImage, resolveImageSrc } from "@/lib/upload-image";
import { toast } from "sonner";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function IconInput({ value, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [errored, setErrored] = useState(false);

  const onPick = async (file: File) => {
    setUploading(true);
    try {
      const { url } = await uploadImage(file);
      onChange(url);
      setErrored(false);
      toast.success("Icon uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };


  const src = value ? resolveImageSrc(value) : "";

  return (
    <div className="flex items-center gap-2">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
        {src && !errored ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt="icon preview"
            className="h-full w-full object-cover"
            onError={() => setErrored(true)}
            onLoad={() => setErrored(false)}
          />
        ) : (
          <ImageOff className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setErrored(false);
        }}
        placeholder="image name or full URL"
        className="flex-1"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
      >
        <Upload className="mr-2 h-4 w-4" />
        {uploading ? "Uploading…" : "Upload"}
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
