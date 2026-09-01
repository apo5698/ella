"use client";

import { useRouter } from "next/navigation";
import QinglanhuaDownloader from "@/components/admin/QinglanhuaDownloader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DOWNLOADER_SOURCES,
  type DownloaderSource,
} from "@/lib/utilities/registry";

const SOURCE_DOWNLOADERS = {
  qinglanhua: QinglanhuaDownloader,
} satisfies Record<DownloaderSource, React.ComponentType>;

export default function Downloader({ source }: { source: DownloaderSource }) {
  const router = useRouter();
  const SourceDownloader = SOURCE_DOWNLOADERS[source];

  return (
    <Tabs
      value={source}
      onValueChange={(value) => {
        router.replace(`/admin/utilities/downloader?source=${value}`);
      }}
    >
      <TabsList>
        {DOWNLOADER_SOURCES.map((item) => (
          <TabsTrigger key={item.slug} value={item.slug}>
            {item.name}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={source}>
        <SourceDownloader />
      </TabsContent>
    </Tabs>
  );
}
