import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { ArrowRight } from "lucide-react";

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
          Write, manage, publish —{" "}
          <span className="text-primary">GramStore</span>
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
        </div>
      </section>
    </div>
  );
}

