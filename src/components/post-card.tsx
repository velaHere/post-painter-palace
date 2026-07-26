import { Link } from "@tanstack/react-router";
import { getApiBaseUrl } from "@/lib/api-config";
import { FileText } from "lucide-react";

export interface PostSummary {
  title: string;
  slug: string;
  icon?: string | null;
  description?: string | null;
  category?: string | null;
  postType?: string | null;
  published?: boolean;
}

export function PostCard({ post }: { post: PostSummary }) {
  const iconUrl =
    post.icon && post.icon.length > 0
      ? post.icon.startsWith("http")
        ? post.icon
        : `${getApiBaseUrl()}/image/${post.icon}`
      : null;

  return (
    <Link
      to="/editor/$slug"
      params={{ slug: post.slug }}
      className="group flex flex-col rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/60 hover:bg-accent"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md bg-muted">
          {iconUrl ? (
            <img
              src={iconUrl}
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <FileText className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium">{post.title}</h3>
          <p className="truncate text-xs text-muted-foreground">
            /{post.slug}
          </p>
        </div>
      </div>
      {post.description && (
        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
          {post.description}
        </p>
      )}
      <div className="mt-3 flex items-center gap-2 text-xs">
        {post.category && (
          <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground">
            {post.category}
          </span>
        )}
        {post.published !== undefined && (
          <span
            className={`rounded px-2 py-0.5 ${
              post.published
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {post.published ? "Published" : "Draft"}
          </span>
        )}
      </div>
    </Link>
  );
}
