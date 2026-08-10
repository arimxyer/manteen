import { ArticleCard } from "@/components/ui/article-card";

export function FeaturedArticle() {
  return (
    <ArticleCard
      image="https://images.unsplash.com/photo-1778084356053-40103587d24f?auto=format&fit=crop&w=1080&q=80"
      title="How resilient teams design for change"
      description="A field guide to building systems that remain clear, useful, and adaptable as the work evolves."
      authorName="Avery Stone"
      rating="4.9"
      href="/articles/resilient-teams"
      onLike={() => console.log("liked")}
      onBookmark={() => console.log("bookmarked")}
      onShare={() => console.log("shared")}
    />
  );
}
