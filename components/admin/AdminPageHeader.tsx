export default function AdminPageHeader({
  title,
  description,
}: {
  title: React.ReactNode;
  description?: string;
}) {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
    </header>
  );
}
