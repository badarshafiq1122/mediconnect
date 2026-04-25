import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TextFieldProps = React.ComponentProps<"input"> & {
  name: string;
  label: string;
  errors?: string[];
  hint?: string;
};

/** Label + input + inline validation message, wired together for screen readers. */
export function TextField({ id, name, label, errors, hint, className, ...inputProps }: TextFieldProps) {
  const fieldId = id ?? `field-${name}`;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const hasError = Boolean(errors && errors.length > 0);

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={fieldId}>{label}</Label>
      <Input
        id={fieldId}
        name={name}
        aria-invalid={hasError || undefined}
        aria-describedby={[hasError ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined}
        className={className}
        {...inputProps}
      />
      {hint && !hasError ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {hasError ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {errors?.[0]}
        </p>
      ) : null}
    </div>
  );
}
