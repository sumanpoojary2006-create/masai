'use client'

import Link from "next/link";
import { usePathname } from "next/navigation";

function getLinkClasses(active: boolean) {
  return active
    ? "rounded-full border border-cyan-300/35 bg-cyan-400/16 px-4 py-2 text-sm font-semibold text-cyan-100 shadow-[0_12px_30px_rgba(45,212,191,0.18)] backdrop-blur-xl"
    : "rounded-full border border-white/12 bg-white/7 px-4 py-2 text-sm font-medium text-slate-300 transition backdrop-blur-xl hover:border-cyan-300/24 hover:bg-white/10 hover:text-slate-100";
}

export function BatchDetailsHeaderNav({ canViewResources }: { canViewResources: boolean }) {
  const pathname = usePathname();

  const allBatchesActive = pathname === "/batch-details/dashboard" || pathname.startsWith("/batch-details/batch/");
  const resourcesActive = pathname.startsWith("/batch-details/resources-dashboard");
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
          href="/batch-details/educators"
          className={getLinkClasses(educatorsActive)}
        >
          Educators
        </Link>
      ) : null}
    </div>
  );
}
