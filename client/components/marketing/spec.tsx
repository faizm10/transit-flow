import Link from "next/link";
import type { ReactNode } from "react";

/**
 * "Spec Sheet" primitives for the marketing pages. Styles live in globals.css
 * under `.tf-*`.
 */

/** Slash-delimited monospace metadata: `/ 09.10.26 / Product / 6 min`. */
export function SpecMeta({
  items,
  className = "",
}: {
  items: (string | null | undefined | false)[];
  className?: string;
}) {
  const parts = items.filter(Boolean) as string[];
  return (
    <span className={`tf-meta ${className}`}>
      {parts.map((p, i) => (
        <span key={i}>
          <span className="sl">/</span>
          {p}
          {i < parts.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}

/** Corner-bracket section label. */
export function Eyebrow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`tf-eyebrow ${className}`}>
      <i />
      {children}
    </span>
  );
}

/** Outline (or solid) button with corner ticks. Renders a Link when `href` is set. */
export function CornerButton({
  children,
  href,
  onClick,
  solid = false,
  target,
  className = "",
}: {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  solid?: boolean;
  target?: string;
  className?: string;
}) {
  const cls = `tf-btn ${solid ? "tf-btn--solid" : ""} ${className}`.trim();
  const inner = (
    <>
      {!solid && (
        <>
          <span className="tf-c tf-c1" />
          <span className="tf-c tf-c2" />
          <span className="tf-c tf-c3" />
          <span className="tf-c tf-c4" />
        </>
      )}
      {children}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        target={target}
        rel={target === "_blank" ? "noopener noreferrer" : undefined}
        className={cls}
      >
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}
