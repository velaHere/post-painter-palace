import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import type { ComponentPropsWithoutRef } from "react";

/**
 * Normalise any YouTube URL shape (watch?v=, youtu.be/, shorts/, embed/)
 * into a privacy-friendly embed URL. Returns null for non-YouTube URLs.
 */
export function toYouTubeEmbed(rawSrc: string): string | null {
  let url: URL;
  try {
    url = new URL(rawSrc, "https://example.invalid");
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  let id: string | null = null;

  if (host === "youtu.be") {
    id = url.pathname.slice(1);
  } else if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "youtube-nocookie.com"
  ) {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else if (url.pathname.startsWith("/embed/")) id = url.pathname.slice(7);
    else if (url.pathname.startsWith("/shorts/")) id = url.pathname.slice(8);
  }

  if (!id) return null;
  id = id.split("/")[0];
  if (!/^[\w-]{6,}$/.test(id)) return null;

  const params = new URLSearchParams({ rel: "0" });
  const start = url.searchParams.get("start") ?? url.searchParams.get("t");
  if (start) params.set("start", start.replace(/\D/g, ""));

  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}

function Iframe(props: ComponentPropsWithoutRef<"iframe">) {
  const src = typeof props.src === "string" ? props.src : "";
  const embed = toYouTubeEmbed(src);

  if (!embed) {
    return (
      <span className="md-embed">
        <iframe
          {...props}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </span>
    );
  }

  return (
    <span className="md-embed md-embed-video">
      <iframe
        src={embed}
        title={props.title ?? "YouTube video"}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        frameBorder={0}
      />
    </span>
  );
}

export function MarkdownPreview({ value }: { value: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
      components={{ iframe: Iframe }}
    >
      {value || "*Nothing to preview.*"}
    </ReactMarkdown>
  );
}
