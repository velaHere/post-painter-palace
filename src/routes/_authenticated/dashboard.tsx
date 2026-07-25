import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { api } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { PostCard, type PostSummary } from "@/components/post-card";
import { NewPostDialog } from "@/components/new-post-dialog";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — GramStore" },
      { name: "description", content: "Manage your GramStore posts." },
      { property: "og:title", content: "Dashboard — GramStore" },
      {
        property: "og:description",
        content: "Manage your GramStore posts.",
      },
    ],
  }),
  component: Dashboard,
});

type Section = "posts";

const SECTIONS: { key: Section; label: string; icon: React.ReactNode }[] = [
  { key: "posts", label: "Posts", icon: <FileText className="h-4 w-4" /> },
];

function Dashboard() {
  const { username } = useAuth();
  const [section, setSection] = useState<Section>("posts");

  const postsQuery = useQuery({
    queryKey: ["posts", username],
    enabled: !!username,
    queryFn: async () => {
      const data = await api<PostSummary[] | { posts?: PostSummary[] }>(
        `/${encodeURIComponent(username!)}/post`,
        { auth: true },
      );
      if (Array.isArray(data)) return data;
      return data?.posts ?? [];
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Welcome back{username ? `, ${username}` : ""}.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <aside className="rounded-lg border border-border bg-card p-2">
          <nav className="flex flex-col gap-1">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                  section === s.key
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-accent"
                }`}
              >
                {s.icon}
                {s.label}
              </button>
            ))}
          </nav>
        </aside>

        <section>
          {section === "posts" && (
            <PostsSection
              loading={postsQuery.isLoading}
              error={postsQuery.error}
              posts={postsQuery.data ?? []}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function PostsSection({
  loading,
  error,
  posts,
}: {
  loading: boolean;
  error: unknown;
  posts: PostSummary[];
}) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Posts</h2>
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Loading posts…"
              : `You have ${posts.length} ${posts.length === 1 ? "post" : "posts"}.`}
          </p>
        </div>
        <NewPostDialog />
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load posts"}
        </div>
      )}

      {!loading && !error && posts.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No posts yet. Create your first one to get started.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((p) => (
          <PostCard key={p.slug} post={p} />
        ))}
      </div>
    </div>
  );
}
