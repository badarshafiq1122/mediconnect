import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LinkButton } from "@/components/link-button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { DAY_NAMES } from "@/lib/time";
import type { DoctorFilters as Filters } from "@/features/doctors/validation";

const RATINGS = [
  { value: "", label: "Any rating" },
  { value: "3", label: "3.0 and up" },
  { value: "4", label: "4.0 and up" },
  { value: "4.5", label: "4.5 and up" },
];

/**
 * A plain GET form: the filters live in the URL, so results are shareable, bookmarkable and work without
 * JavaScript. The Server Component page re-reads them on every navigation.
 */
export function DoctorFilters({ filters, specialties }: { filters: Filters; specialties: string[] }) {
  const hasFilters = Boolean(filters.q || filters.specialty || filters.day !== undefined || filters.minRating);

  return (
    <form method="get" role="search" aria-label="Find a doctor" className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1.3fr_1.3fr_1.3fr_auto] lg:items-end">
      <div className="grid gap-1.5">
        <Label htmlFor="q">Name or condition</Label>
        <Input id="q" name="q" type="search" placeholder="e.g. heart, skin, Chen" defaultValue={filters.q ?? ""} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="specialty">Specialty</Label>
        <NativeSelect id="specialty" name="specialty" defaultValue={filters.specialty ?? ""} className="w-full">
          <NativeSelectOption value="">All specialties</NativeSelectOption>
          {specialties.map((specialty) => (
            <NativeSelectOption key={specialty} value={specialty}>
              {specialty}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="day">Available on</Label>
        <NativeSelect id="day" name="day" defaultValue={filters.day === undefined ? "" : String(filters.day)} className="w-full">
          <NativeSelectOption value="">Any day</NativeSelectOption>
          {DAY_NAMES.map((name, index) => (
            <NativeSelectOption key={name} value={String(index)}>
              {name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="minRating">Rating</Label>
        <NativeSelect id="minRating" name="minRating" defaultValue={filters.minRating === undefined ? "" : String(filters.minRating)} className="w-full">
          {RATINGS.map((rating) => (
            <NativeSelectOption key={rating.value} value={rating.value}>
              {rating.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-1">
        <Button type="submit" className="flex-1 lg:flex-none">
          <SearchIcon aria-hidden="true" />
          Search
        </Button>
        {hasFilters ? (
          <LinkButton href="/patient/doctors" variant="ghost">
            Reset
          </LinkButton>
        ) : null}
      </div>
    </form>
  );
}
