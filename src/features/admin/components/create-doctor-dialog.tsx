"use client";

import { useActionState, useEffect, useState } from "react";
import { UserPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TextField } from "@/components/text-field";
import { createDoctorFormAction, type CreateDoctorFormState } from "@/features/doctors/actions";

const initialState: CreateDoctorFormState = {};

export function CreateDoctorDialog() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createDoctorFormAction, initialState);

  useEffect(() => {
    if (state.ok) {
      toast.success("Doctor added. They can sign in with the temporary password.");
      setOpen(false);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <UserPlusIcon aria-hidden="true" />
        Add doctor
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a doctor</DialogTitle>
          <DialogDescription>
            Creates a doctor account with a default Monday-Friday 09:00-17:00 schedule. Share the temporary password
            securely; they should change it after signing in.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="name" label="Full name" defaultValue={state.values?.name} errors={state.fieldErrors?.name} required />
            <TextField name="specialty" label="Specialty" defaultValue={state.values?.specialty} errors={state.fieldErrors?.specialty} required />
          </div>
          <TextField name="email" label="Email" type="email" autoComplete="off" defaultValue={state.values?.email} errors={state.fieldErrors?.email} required />
          <TextField
            name="password"
            label="Temporary password"
            type="text"
            autoComplete="off"
            hint="At least 8 characters, with a letter and a number."
            errors={state.fieldErrors?.password}
            required
          />
          <div className="grid gap-1.5">
            <Label htmlFor="bio">Biography</Label>
            <Textarea id="bio" name="bio" rows={3} maxLength={1500} defaultValue={state.values?.bio} />
            {state.fieldErrors?.bio ? (
              <p role="alert" className="text-xs text-destructive">
                {state.fieldErrors.bio[0]}
              </p>
            ) : null}
          </div>
          {state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create doctor"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
