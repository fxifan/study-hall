"use client";

import { useState } from "react";
import { badgeSrc, type Rank } from "@/lib/social/ranks";

/**
 * A Study Rank badge. The image is decorative when the rank name is shown next to it; otherwise
 * it carries the name as its accessible label. If the asset fails, a coloured disc with the rank's
 * initial stands in, so the rank is never lost.
 */
export function RankBadge({ rank, size = 24, labelled = true, className = "" }: { rank: Pick<Rank, "id" | "name" | "color">; size?: number; labelled?: boolean; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        role={labelled ? "img" : undefined}
        aria-label={labelled ? rank.name : undefined}
        aria-hidden={labelled ? undefined : true}
        title={rank.name}
        className={`inline-grid shrink-0 place-items-center rounded-full font-semibold text-white ${className}`}
        style={{ width: size, height: size, background: rank.color, fontSize: Math.max(9, size * 0.42) }}
      >
        {rank.name[0]}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small static SVG; next/image adds nothing here
    <img
      src={badgeSrc(rank)}
      width={size}
      height={size}
      alt={labelled ? rank.name : ""}
      title={rank.name}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`inline-block shrink-0 ${className}`}
    />
  );
}
