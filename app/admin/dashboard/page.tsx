export const dynamic = "force-dynamic";

import { AdminDashboardClient } from "@/components/admin-dashboard-client";
import {
  getAdminBatchStats,
  getAdminDashboardData,
  getAdminLectureStats
} from "@/lib/queries";

export default async function AdminDashboardPage() {
  const [userStats, batchStats, lectureStats] = await Promise.all([
    getAdminDashboardData(),
    getAdminBatchStats(),
    getAdminLectureStats()
  ]);

  return (
    <AdminDashboardClient
      userStats={userStats}
      batchStats={batchStats}
      lectureStats={lectureStats}
    />
  );
}
