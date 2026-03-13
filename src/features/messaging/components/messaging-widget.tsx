"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// The thread pulls in TanStack Query polling, autosize and read-receipt logic that the rest of the page does not
// need to start rendering, so it is split out and loaded on the client only (Next 15 requires ssr:false to live
// inside a Client Component).
export const MessagingWidget = dynamic(
  () => import("@/features/messaging/components/message-thread").then((module) => module.MessageThread),
  {
    ssr: false,
    loading: () => <Skeleton className="h-72 w-full rounded-xl" aria-label="Loading messages" />,
  },
);
