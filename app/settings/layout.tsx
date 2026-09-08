import PageContainer from "@/components/PageContainer";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen p-6">
      <PageContainer className="flex flex-col gap-4">{children}</PageContainer>
    </div>
  );
}
