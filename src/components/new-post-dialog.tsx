import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus } from "lucide-react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export function NewPostDialog() {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    title: "",
    description: "",
    slug: "",
    category: "",
    postType: "",
    icon: "",
    actionLabel: "",
    actionLink: "",
    published: false,
    content: "# New Post\n\nStart writing…\n",
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api("/cms/post/create", {
        method: "POST",
        auth: true,
        body: form,
      });
      toast.success("Post created");
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["posts"] });
      navigate({ to: "/editor/$slug", params: { slug: form.slug } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create post");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          New post
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create new post</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Title" required>
              <Input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                required
              />
            </Field>
            <Field label="Slug" required>
              <Input
                value={form.slug}
                onChange={(e) => set("slug", e.target.value)}
                required
                pattern="[a-z0-9-]+"
              />
            </Field>
          </div>
          <Field label="Description" required>
            <Input
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" required>
              <Input
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                required
              />
            </Field>
            <Field label="Post type" required>
              <Input
                value={form.postType}
                onChange={(e) => set("postType", e.target.value)}
                required
              />
            </Field>
          </div>
          <Field label="Icon (image name)">
            <Input
              value={form.icon}
              onChange={(e) => set("icon", e.target.value)}
            />
          </Field>
          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="published"
              checked={form.published}
              onCheckedChange={(v) => set("published", v === true)}
            />
            <Label htmlFor="published" className="cursor-pointer">
              Publish immediately
            </Label>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}
