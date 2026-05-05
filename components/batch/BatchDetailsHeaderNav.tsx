'use client'

import Link from "next/link";
import { usePathname } from "next/navigation";

function getLinkClasses(active: boolean) {
  return active
    ? "rounded-full border border-cyan-400/30 bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-200 shadow-[0_12px_30px_rgba(45,212,191,0.18)]"
    : "rounded-full border border-slate-700 bg-slate-800/90 px-4 py-2 text-sm font-medium text-slate-400 transition hover:border-slate-600 hover:text-slate-200";
}

export function BatchDetailsHeaderNav({ canViewResources }: { canViewResources: boolean }) {
  const pathname = usePathname();

  const allBatchesActive = pathname === "/batch-details/dashboard" || pathname.startsWith("/batch-details/batch/");
  const resourcesActive = pathname.startsWith("/batch-details/resources-dashboard");
  const instructorCalendarActive = pathname.startsWith("/batch-details/instructor-calendar");
  const ccMappingActive = pathname.startsWith("/batch-details/cc-mapping");
  const educatorsActive = pathname.startsWith("/batch-details/educators");

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link href="/batch-details/dashboard" className={getLinkClasses(allBatchesActive)}>
        All Batches
      </Link>
      {canViewResources ? (
        <Link
          href="/batch-details/resources-dashboard"
          className={getLinkClasses(resourcesActive)}
        >
          Resources Dashboard
        </Link>
      ) : null}
      {canViewResources ? (
        <Link
          href="/batch-details/instructor-calendar"
          className={getLinkClasses(instructorCalendarActive)}
        >
          Instructor Calendar
        </Link>
      ) : null}
      {canViewResources ? (
        <Link
          href="/batch-details/cc-mapping"
          className={getLinkClasses(ccMappingActive)}
        >
          CC Batch Mapping
        </Link>
      ) : null}
      {canViewResources ? (
        <Link
          href="/batch-details/educators"
          className={getLinkClasses(educatorsActive)}
        >
          Educators
        </Link>
      ) : null}
    </div>
  );
}
