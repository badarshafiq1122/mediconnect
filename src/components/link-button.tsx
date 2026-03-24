import Link from "next/link";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LinkButtonProps = Omit<React.ComponentProps<typeof Link>, "className"> &
  VariantProps<typeof buttonVariants> & { className?: string };

/**
 * A real link (role "link", native middle-click/open-in-new-tab) styled as a shadcn Button. Rendering the Base UI
 * Button through `render={<Link/>}` would stamp role="button" on the anchor and mislead assistive technology.
 */
export function LinkButton({ variant, size, className, ...props }: LinkButtonProps) {
  return <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
