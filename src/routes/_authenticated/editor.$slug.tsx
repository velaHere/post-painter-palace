import { createFileRoute, useNavigate, Link, useBlocker } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { ContentEditor } from "@/components/content-editor";
import { IconInput } from "@/components/icon-input";
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

  // New body-only endpoint — returns just the markdown body without YAML frontmatter.
  const contentQuery = useQuery({
    queryKey: ["post-markdown", slug],
    queryFn: () =>
      api<{ markdown: string }>(
        `/cms/post/${encodeURIComponent(slug)}/description`,
        { auth: true },
      ),
  });

  const [fm, setFm] = useState<FrontMatter>(EMPTY_FM);
  const [fmBaseline, setFmBaseline] = useState<FrontMatter>(EMPTY_FM);
  const [content, setContent] = useState("");
  const [contentBaseline, setContentBaseline] = useState("");
  const [savingFm, setSavingFm] = useState(false);
  const [savingContent, setSavingContent] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingTab, setPendingTab] = useState<Tab | null>(null);

  useEffect(() => {
    const found = postsQuery.data?.find((p) => p.slug === slug);
    if (found) {
      const merged = { ...EMPTY_FM, ...found };
      setFm(merged);
      setFmBaseline(merged);
    }
  }, [postsQuery.data, slug]);

  useEffect(() => {
    if (contentQuery.data?.markdown !== undefined) {
      setContent(contentQuery.data.markdown);
      setContentBaseline(contentQuery.data.markdown);
    }
  }, [contentQuery.data]);

  const dirtyGeneral = useMemo(
    () => JSON.stringify(fm) !== JSON.stringify(fmBaseline),
    [fm, fmBaseline],
  );
  const dirtyContent = content !== contentBaseline;
  const anyDirty = dirtyGeneral || dirtyContent;

  // Router-level blocker (in-app nav + beforeunload)
  const blocker = useBlocker({
    shouldBlockFn: () => anyDirty,
    enableBeforeUnload: () => anyDirty,
    withResolver: true,
  });

  const saveFrontMatter = async () => {
    setSavingFm(true);
    try {
      await api(`/cms/post/updateFrontMatter/${encodeURIComponent(slug)}`, {
        method: "PUT",
        auth: true,
        body: fm,
      });
      toast.success("Details saved");
      setFmBaseline(fm);
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
      setContentBaseline(content);
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
      setFmBaseline(fm);
      setContentBaseline(content);
      await qc.invalidateQueries({ queryKey: ["posts", username] });
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const tryChangeTab = (next: Tab) => {
    if (next === tab) return;
    const leavingDirty =
      (tab === "general" && dirtyGeneral) ||
      (tab === "content" && dirtyContent);
    if (leavingDirty) {
      setPendingTab(next);
    } else {
      setTab(next);
    }
  };

  const confirmTabSwitch = () => {
    if (pendingTab) {
      // Discard changes on the leaving tab
      if (tab === "general") setFm(fmBaseline);
      else setContent(contentBaseline);
      setTab(pendingTab);
      setPendingTab(null);
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
          <h1 className="text-lg font-semibold">{fm.title || slug}</h1>
          {anyDirty && (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
              Unsaved changes
            </span>
          )}
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
              onClick={() => tryChangeTab("general")}
              icon={<Settings2 className="h-4 w-4" />}
              label="General"
              dirty={dirtyGeneral}
            />
            <TabButton
              active={tab === "content"}
              onClick={() => tryChangeTab("content")}
              icon={<FileText className="h-4 w-4" />}
              label="Content"
              dirty={dirtyContent}
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
            <ContentEditor
              value={content}
              onChange={setContent}
              onSave={saveContent}
              saving={savingContent}
            />
          )}
        </div>
      </div>

      {/* Router-level unsaved-changes guard */}
      <AlertDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open && blocker.status === "blocked") blocker.reset();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved edits. Leaving now will lose them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => blocker.status === "blocked" && blocker.reset()}
            >
              Stay
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => blocker.status === "blocked" && blocker.proceed()}
            >
              Discard & leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Tab-switch guard */}
      <AlertDialog
        open={pendingTab !== null}
        onOpenChange={(open) => {
          if (!open) setPendingTab(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes on this tab?</AlertDialogTitle>
            <AlertDialogDescription>
              Switching tabs without saving will discard your edits here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={confirmTabSwitch}>
              Discard & switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  dirty,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  dirty?: boolean;
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
      <span className="flex-1 text-left">{label}</span>
      {dirty && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
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
          <Input value={fm.title} onChange={(e) => set("title", e.target.value)} />
        </FormField>
        <FormField label="Slug">
          <Input value={fm.slug} onChange={(e) => set("slug", e.target.value)} />
        </FormField>
        <FormField label="Description" className="md:col-span-2">
          <Input
            value={fm.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </FormField>
        <FormField label="Category">
          <Input value={fm.category} onChange={(e) => set("category", e.target.value)} />
        </FormField>
        <FormField label="Post type">
          <Input value={fm.postType} onChange={(e) => set("postType", e.target.value)} />
        </FormField>
        <FormField label="Icon" className="md:col-span-2">
          <IconInput value={fm.icon} onChange={(v) => set("icon", v)} />
        </FormField>
        <FormField label="Action label">
          <Input
            value={fm.actionLabel}
            onChange={(e) => set("actionLabel", e.target.value)}
          />
        </FormField>
        <FormField label="Action link">
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
