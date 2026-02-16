import { LinkButton } from "@/components/link-button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">We couldn&apos;t find that page</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        It may have moved, or you might not have access to it.
      </p>
      <LinkButton href="/">Back to home</LinkButton>
    </div>
  );
}
