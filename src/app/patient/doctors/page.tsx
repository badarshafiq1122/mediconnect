import type { Metadata } from "next";
import { SearchXIcon } from "lucide-react";
import { LinkButton } from "@/components/link-button";
import { PageHeader } from "@/components/page-header";
import { requirePageUser } from "@/lib/session";
import { DoctorCard } from "@/features/doctors/components/doctor-card";
import { DoctorFilters } from "@/features/doctors/components/doctor-filters";
import { listSpecialties, searchDoctors } from "@/features/doctors/queries";
import { parseDoctorFilters } from "@/features/doctors/validation";

export const metadata: Metadata = { title: "Find a doctor" };

type SearchParams = Record<string, string | string[] | undefined>;

function pageHref(filters: ReturnType<typeof parseDoctorFilters>, cursor?: string): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.specialty) params.set("specialty", filters.specialty);
  if (filters.day !== undefined) params.set("day", String(filters.day));
  if (filters.minRating !== undefined) params.set("minRating", String(filters.minRating));
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  return query ? `/patient/doctors?${query}` : "/patient/doctors";
}

export default async function DoctorsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePageUser("patient");
  const filters = parseDoctorFilters(await searchParams);
  const [{ doctors, nextCursor }, specialties] = await Promise.all([searchDoctors(filters), listSpecialties()]);

  return (
    <div className="grid gap-6">
      <PageHeader title="Find a doctor" description="Search by name or condition, then filter by specialty, availability and rating." />
      <DoctorFilters filters={filters} specialties={specialties} />

      {doctors.length === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center">
          <SearchXIcon className="size-7 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">No doctors match those filters</p>
          <p className="max-w-sm text-sm text-muted-foreground">Try a different specialty or day, or clear the filters.</p>
          <LinkButton href="/patient/doctors" variant="outline">
            Clear filters
          </LinkButton>
        </div>
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Doctors">
            {doctors.map((doctor) => (
              <li key={doctor.id}>
                <DoctorCard doctor={doctor} />
              </li>
            ))}
          </ul>
          <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
            {filters.cursor ? (
              <LinkButton href={pageHref({ ...filters, cursor: undefined })} variant="outline">
                Back to first page
              </LinkButton>
            ) : (
              <span />
            )}
            {nextCursor ? (
              <LinkButton href={pageHref(filters, nextCursor)} variant="outline" data-testid="next-page">
                Next page
              </LinkButton>
            ) : null}
          </nav>
        </>
      )}
    </div>
  );
}
