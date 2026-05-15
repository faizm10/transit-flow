import Image from "next/image";

interface AuthorAvatarProps {
  name: string | null;
  avatarUrl: string | null;
  githubLogin: string | null;
  size?: "sm" | "md";
}

export default function AuthorAvatar({
  name,
  avatarUrl,
  githubLogin,
  size = "sm",
}: AuthorAvatarProps) {
  const dimension = size === "sm" ? 24 : 32;
  const display = name ?? githubLogin ?? "Anonymous";
  const initials = display.slice(0, 2).toUpperCase();

  return (
    <span className="inline-flex items-center gap-1.5">
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt={display}
          width={dimension}
          height={dimension}
          className="rounded-full"
          unoptimized
        />
      ) : (
        <span
          className="inline-flex items-center justify-center rounded-full bg-[var(--landing-band)] text-[var(--landing-fg)] font-semibold"
          style={{ width: dimension, height: dimension, fontSize: dimension * 0.38 }}
        >
          {initials}
        </span>
      )}
      <span className="text-sm text-[var(--landing-muted)]">
        {githubLogin ?? name ?? "Anonymous"}
      </span>
    </span>
  );
}
