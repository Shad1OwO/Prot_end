import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DestinationDetailPage } from "@/components/destination-detail-page";
import { apiOrigin } from "@/lib/api";
import { alternates, getDictionary, isLocale } from "@/lib/i18n";
import type { DestinationDetail } from "@tourism/contracts";

export async function generateMetadata({ params }: PageProps<"/[lang]/destinations/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isLocale(lang)) return {};
  const fallbackTitle = slug.replaceAll("-", " ");
  try {
    const response = await fetch(`${apiOrigin}/api/v1/destinations/${encodeURIComponent(slug)}?locale=${lang}`, { next: { revalidate: 3600 } });
    if (!response.ok) return { title: fallbackTitle, alternates: alternates(`/destinations/${slug}`) };
    const destination = await response.json() as DestinationDetail;
    return { title: destination.name, description: destination.shortDescription, alternates: alternates(`/destinations/${slug}`), openGraph: { title: destination.name, description: destination.shortDescription, images: [{ url: destination.primaryImage.url, width: destination.primaryImage.width, height: destination.primaryImage.height, alt: destination.primaryImage.alt }] } };
  } catch {
    return { title: fallbackTitle, alternates: alternates(`/destinations/${slug}`) };
  }
}

export default async function Page({ params }: PageProps<"/[lang]/destinations/[slug]">) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();
  return <DestinationDetailPage slug={slug} locale={lang} dictionary={getDictionary(lang)} />;
}
