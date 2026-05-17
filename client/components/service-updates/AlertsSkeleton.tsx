export function AlertsSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-36 animate-pulse rounded-2xl border border-[#1e3a5f] bg-[#0f1e35]"
        />
      ))}
    </div>
  );
}
