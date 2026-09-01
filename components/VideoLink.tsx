"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ComponentProps } from "react";

type VideoLinkProps = ComponentProps<typeof Link>;

export default function VideoLink({ onClick, ...props }: VideoLinkProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const from = query ? `${pathname}?${query}` : pathname;
  let href = props.href;

  if (typeof href === "string" && href.startsWith("/video/")) {
    const url = new URL(href, "http://localhost");
    url.searchParams.set("from", from);
    href = `${url.pathname}${url.search}${url.hash}`;
  }

  return <Link {...props} href={href} onClick={onClick} />;
}
