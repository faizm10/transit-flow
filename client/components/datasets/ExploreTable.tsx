"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Search box for an exploration table.
 *
 * The query lives in the URL, so a search is shareable, survives a reload, and
 * is filtered *in the database* by the server component that reads it. The
 * alternative — fetching a dataset's rows and filtering in the browser — is the
 * pattern this whole redesign exists to remove; a GO feed has 3.1M stop times.
 *
 * Typing is debounced because every keystroke would otherwise be a round trip,
 * and wrapped in a transition so the old results stay visible and interactive
 * while the new ones load instead of flashing a spinner.
 */
export function ExploreSearch({
  placeholder,
  paramName = "q",
}: {
  placeholder: string;
  paramName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [value, setValue] = useState(searchParams.get(paramName) ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const commit = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.trim()) params.set(paramName, next.trim());
      else params.delete(paramName);
      // A new search invalidates the cursor — page 3 of the old results is
      // meaningless for a different query.
      params.delete("cursor");
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [pathname, paramName, router, searchParams]
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className="relative max-w-sm">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn("pl-8", isPending && "opacity-70")}
        onChange={(event) => {
          const next = event.target.value;
          setValue(next);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => commit(next), 250);
        }}
      />
      {value && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Clear search"
          className="absolute top-1/2 right-1.5 -translate-y-1/2"
          onClick={() => {
            setValue("");
            clearTimeout(timer.current);
            commit("");
          }}
        >
          <X />
        </Button>
      )}
    </div>
  );
}
