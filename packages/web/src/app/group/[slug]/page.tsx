import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getGroup, getGroupHistory, marketThumbnail, usd } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { EditMarketLink } from "@/components/EditMarketLink";
import { GroupChart } from "@/components/GroupChart";
import { GroupView } from "@/components/GroupView";

export const dynamic = "force-dynamic";

export default async function GroupPage({ params }: { params: { slug: string } }) {
  const [group, series] = await Promise.all([
    getGroup(params.slug),
    getGroupHistory(params.slug),
  ]);
  if (!group) notFound();

  const winner = group.resolvedMarketId
    ? group.markets.find((m) => m.id === group.resolvedMarketId)
    : null;

  return (
    <main className="container space-y-6 py-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All markets
      </Link>

      <div>
        <div className="mb-2 flex items-center gap-2">
          <Badge>{group.category}</Badge>
          <Badge variant="secondary">{group.markets.length} outcomes</Badge>
          {group.status === "RESOLVED" && (
            <Badge variant="outline" className="border-yes text-yes">
              RESOLVED — {winner?.groupLabel?.toUpperCase() ?? "?"}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {usd(group.volume)} Vol
            {group.closesAt &&
              ` · Closes ${new Date(group.closesAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
          </span>
          <EditMarketLink slug={group.slug} group />
        </div>
        <div className="flex items-start gap-3">
          {/* Same logo as the grid card, one size up (56px vs 36px). */}
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element -- external, per-market seeded photo; not worth Next/Image remote-pattern config for a placeholder */}
            <img
              src={group.imageUrl ?? marketThumbnail(group.slug)}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
          <h1 className="text-2xl font-bold leading-tight md:text-3xl">{group.title}</h1>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <GroupChart series={series} height={260} />
        </CardContent>
      </Card>

      <GroupView group={group} />

      {group.description && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Rules</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed text-muted-foreground">
            {group.description}
            <Separator className="my-3" />
            <div className="text-xs">
              Each outcome is its own on-chain binary market — open one from the list to see its
              condition id and activity.
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
