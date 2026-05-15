import { Bus, Train } from "lucide-react";

interface RouteTypeBadgeProps {
  type: string;
}

export default function RouteTypeBadge({ type }: RouteTypeBadgeProps) {
  const isTrain = type === "train";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
        isTrain
          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
          : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
      }`}
    >
      {isTrain ? <Train className="h-3 w-3" aria-hidden /> : <Bus className="h-3 w-3" aria-hidden />}
      {isTrain ? "Train" : "Bus"}
    </span>
  );
}
