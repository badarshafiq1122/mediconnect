"use client";

import { useState, useTransition } from "react";
import { CalendarClockIcon, PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TextField } from "@/components/text-field";
import { DAY_NAMES } from "@/lib/time";
import { setDoctorActiveAction, updateDoctorAction } from "@/features/doctors/actions";
import { AvailabilityEditor } from "@/features/doctors/components/availability-editor";
import { RatingLabel } from "@/features/doctors/components/doctor-card";
import type { AdminDoctorRow } from "@/features/doctors/queries";

function EditProfileDialog({ doctor }: { doctor: AdminDoctorRow }) {
  const [open, setOpen] = useState(false);
  const [specialty, setSpecialty] = useState(doctor.specialty);
  const [bio, setBio] = useState(doctor.bio);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateDoctorAction({ doctorId: doctor.id, specialty, bio });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      toast.success("Profile updated");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <PencilIcon aria-hidden="true" />
        Edit profile
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {doctor.name}</DialogTitle>
          <DialogDescription>Shown to patients in search results and on the booking page.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <TextField
            name="specialty"
            label="Specialty"
            value={specialty}
            onChange={(event) => setSpecialty(event.target.value)}
            errors={errors.specialty}
          />
          <div className="grid gap-1.5">
            <Label htmlFor={`bio-${doctor.id}`}>Biography</Label>
            <Textarea id={`bio-${doctor.id}`} value={bio} onChange={(event) => setBio(event.target.value)} rows={4} maxLength={1500} />
            {errors.bio ? <p className="text-xs text-destructive">{errors.bio[0]}</p> : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AvailabilityDialog({ doctor, slotMinutes }: { doctor: AdminDoctorRow; slotMinutes: number }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <CalendarClockIcon aria-hidden="true" />
        Availability
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{doctor.name}&apos;s weekly availability</DialogTitle>
        </DialogHeader>
        <AvailabilityEditor
          initial={doctor.availability}
          doctorId={doctor.id}
          slotMinutes={slotMinutes}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

export function AdminDoctorCard({ doctor, slotMinutes }: { doctor: AdminDoctorRow; slotMinutes: number }) {
  const [pending, startTransition] = useTransition();

  function toggleActive() {
    startTransition(async () => {
      const result = await setDoctorActiveAction({ doctorId: doctor.id, isActive: !doctor.isActive });
      if (!result.ok) return void toast.error(result.error);
      toast.success(doctor.isActive ? `${doctor.name} hidden from patients` : `${doctor.name} is bookable again`);
    });
  }

  return (
    <Card data-testid="admin-doctor" data-active={doctor.isActive}>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-0.5">
            <p className="font-medium">{doctor.name}</p>
            <p className="text-sm text-muted-foreground">{doctor.email}</p>
          </div>
          <Badge variant={doctor.isActive ? "secondary" : "outline"}>{doctor.isActive ? "Active" : "Inactive"}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Badge variant="secondary">{doctor.specialty}</Badge>
          <RatingLabel rating={doctor.rating} count={doctor.ratingCount} />
          <span className="text-muted-foreground">{doctor.totalAppointments} appointments</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {doctor.availableDays.length > 0
            ? `Available ${doctor.availableDays.map((day) => DAY_NAMES[day]!.slice(0, 3)).join(", ")}`
            : "No availability set"}
        </p>
        <div className="flex flex-wrap gap-2">
          <EditProfileDialog doctor={doctor} />
          <AvailabilityDialog doctor={doctor} slotMinutes={slotMinutes} />
          <Button variant={doctor.isActive ? "ghost" : "default"} size="sm" onClick={toggleActive} disabled={pending} className={doctor.isActive ? "text-destructive" : undefined}>
            {doctor.isActive ? "Deactivate" : "Reactivate"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
