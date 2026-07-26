import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { ArrowRight, FileText, Image as ImageIcon, Zap } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GramStore — Welcome" },
      {
        name: "description",
        content:
          "GramStore CMS lets you write, organize, and publish markdown posts with a modern editor.",
      },
      { property: "og:title", content: "GramStore — Welcome" },
      {
        property: "og:description",
        content:
          "GramStore CMS lets you write, organize, and publish markdown posts with a modern editor.",
      },
    ],
  }),
  component: Welcome,
});

function Welcome() {
  const { isAuthenticated } = useAuth();
  return (
    <div>
      <section className="mx-auto max-w-4xl px-4 py-24 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Write, manage, publish — <span className="text-primary">GramStore</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          A minimal CMS for your markdown posts. Focused editor, clean
          dashboard, no clutter.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild size="lg">
            <Link to={isAuthenticated ? "/dashboard" : "/login"}>
              {isAuthenticated ? "Go to dashboard" : "Get started"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <a href="#features">Learn more</a>
          </Button>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-5xl px-4 pb-24">
        <div className="grid gap-6 sm:grid-cols-3">
          <FeatureCard
            icon={<FileText className="h-5 w-5" />}
            title="Markdown first"
            body="Write in plain markdown with a live preview."
          />
          <FeatureCard
            icon={<Zap className="h-5 w-5" />}
            title="Fast dashboard"
            body="See all your posts at a glance and jump straight into editing."
          />
          <FeatureCard
            icon={<ImageIcon className="h-5 w-5" />}
            title="Image uploads"
            body="Attach images to your posts with a single click."
          />
        </div>
      </section>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
