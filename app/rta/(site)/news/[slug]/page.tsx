import { notFound } from "next/navigation";
import NewsArticle from "@/components/NewsArticle";
import { NEWS } from "@/lib/data";

export function generateStaticParams() {
  return NEWS.map((item) => ({ slug: item.slug }));
}

export default async function NewsArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = NEWS.find((n) => n.slug === slug);

  if (!item) {
    notFound();
  }

  return <NewsArticle item={item} />;
}
