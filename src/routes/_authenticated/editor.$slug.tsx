import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  FileText,
  Settings2,
  Trash2,
  Save,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { MarkdownEditor } from "@/components/markdown-editor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/editor/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `Editing ${params.slug} — GramStore` },
      { name: "description", content: `Edit the post ${params.slug}.` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EditorPage,
});

type Tab = "general" | "content";

interface FrontMatter {
  title: string;
  description: string;
  slug: string;
  category: string;
  postType: string;
  icon: string;
  actionLabel: string;
  actionLink: string;
  published: boolean;
}

const EMPTY_FM: FrontMatter = {
  title: "",
  description: "",
  slug: "",
  category: "",
  postType: "",
  icon: "",
  actionLabel: "",
  actionLink: "",
  published: false,
};

function EditorPage() {
  const { slug } = Route.useParams();
  const { username } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("general");

  const postsQuery = useQuery({
    queryKey: ["posts", username],
    enabled: !!username,
    queryFn: async () => {
      const data = await api<FrontMatter[] | { posts?: FrontMatter[] }>(
        `/${encodeURIComponent(username!)}/post`,
        { auth: true },
      );
      return Array.isArray(data) ? data : (data?.posts ?? []);
    },
  });

  const contentQuery = useQuery({
    queryKey: ["post", username, slug],
    enabled: !!username,
    queryFn: () =>
      api<{ markdown: string }>(
        `/${encodeURIComponent(username!)}/post/${encodeURIComponent(slug)}`,
      ),
  });

  const [fm, setFm] = useState<FrontMatter>(EMPTY_FM);
  const [content, setContent] = useState("");
  const [savingFm, setSavingFm] = useState(false);
  const [savingContent, setSavingContent] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const found = postsQuery.data?.find((p) => p.slug === slug);
    if (found) setFm({ ...EMPTY_FM, ...found });
  }, [postsQuery.data, slug]);

  useEffect(() => {
    if (contentQuery.data?.markdown !== undefined) {
      setContent(contentQuery.data.markdown);
    }
  }, [contentQuery.data]);

  const saveFrontMatter = async () => {
    setSavingFm(true);
    try {
      await api(`/cms/post/updateFrontMatter/${encodeURIComponent(slug)}`, {
        method: "PUT",
        auth: true,
        body: fm,
      });
      toast.success("Details saved");
      await qc.invalidateQueries({ queryKey: ["posts", username] });
      if (fm.slug !== slug) {
        navigate({ to: "/editor/$slug", params: { slug: fm.slug } });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingFm(false);
    }
  };

  const saveContent = async () => {
    setSavingContent(true);
    try {
      await api(`/cms/post/updateContent/${encodeURIComponent(slug)}`, {
        method: "PUT",
        auth: true,
        body: { content },
      });
      toast.success("Content saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingContent(false);
    }
  };

  const deletePost = async () => {
    setDeleting(true);
    try {
      await api(`/cms/post/delete/${encodeURIComponent(slug)}`, {
        method: "DELETE",
        auth: true,
      });
      toast.success("Post deleted");
      await qc.invalidateQueries({ queryKey: ["posts", username] });
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-7xl flex-col px-4 py-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Dashboard
            </Link>
          </Button>
          <h1 className="text-lg font-semibold">
            {fm.title || slug}
          </h1>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this post?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={deletePost} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="grid flex-1 gap-4 overflow-hidden md:grid-cols-[200px_1fr]">
        <aside className="rounded-lg border border-border bg-card p-2">
          <nav className="flex flex-col gap-1">
            <TabButton
              active={tab === "general"}
              onClick={() => setTab("general")}
              icon={<Settings2 className="h-4 w-4" />}
              label="General"
            />
            <TabButton
              active={tab === "content"}
              onClick={() => setTab("content")}
              icon={<FileText className="h-4 w-4" />}
              label="Content"
            />
          </nav>
        </aside>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {tab === "general" ? (
            <GeneralTab
              fm={fm}
              setFm={setFm}
              onSave={saveFrontMatter}
              saving={savingFm}
              loading={postsQuery.isLoading}
            />
          ) : (
            <MarkdownEditor
              value={content}
              onChange={setContent}
              onSave={saveContent}
              saving={savingContent}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-foreground hover:bg-accent"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function GeneralTab({
  fm,
  setFm,
  onSave,
  saving,
  loading,
}: {
  fm: FrontMatter;
  setFm: React.Dispatch<React.SetStateAction<FrontMatter>>;
  onSave: () => void;
  saving: boolean;
  loading: boolean;
}) {
  const set = <K extends keyof FrontMatter>(k: K, v: FrontMatter[K]) =>
    setFm((f) => ({ ...f, [k]: v }));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border p-3">
        <h2 className="text-sm font-medium">Frontmatter</h2>
        <Button size="sm" onClick={onSave} disabled={saving || loading}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Saving…" : "Save details"}
        </Button>
      </div>
      <div className="grid flex-1 gap-4 overflow-auto p-4 md:grid-cols-2">
        <FormField label="Title">
          <Input
            value={fm.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </FormField>
        <FormField label="Slug">
          <Input
            value={fm.slug}
            onChange={(e) => set("slug", e.target.value)}
          />
        </FormField>
        <FormField label="Description" className="md:col-span-2">
          <Input
            value={fm.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </FormField>
        <FormField label="Category">
          <Input
            value={fm.category}
            onChange={(e) => set("category", e.target.value)}
          />
        </FormField>
        <FormField label="Post type">
          <Input
            value={fm.postType}
            onChange={(e) => set("postType", e.target.value)}
          />
        </FormField>
        <FormField label="Icon (image name)">
          <Input
            value={fm.icon}
            onChange={(e) => set("icon", e.target.value)}
          />
        </FormField>
        <FormField label="Action label">
          <Input
            value={fm.actionLabel}
            onChange={(e) => set("actionLabel", e.target.value)}
          />
        </FormField>
        <FormField label="Action link" className="md:col-span-2">
          <Input
            value={fm.actionLink}
            onChange={(e) => set("actionLink", e.target.value)}
          />
        </FormField>
        <div className="flex items-center gap-2 md:col-span-2">
          <Checkbox
            id="published"
            checked={fm.published}
            onCheckedChange={(v) => set("published", v === true)}
          />
          <Label htmlFor="published" className="cursor-pointer">
            Published
          </Label>
        </div>
      </div>
    </div>
  );
}

function FormField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
