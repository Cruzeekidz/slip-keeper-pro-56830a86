import { Card } from "@/components/ui/card";
import { HardDrive, FileImage, AlertCircle } from "lucide-react";
import { StatsCard } from "@/components/ui/stats-card";
import { useStorageStats } from "@/hooks/useDashboardData";

export function StorageStats() {
  const { data, isLoading, isError } = useStorageStats();

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  if (isLoading) return null;

  if (isError) {
    return (
      <Card className="p-4 bg-expense/5 border-expense/20">
        <div className="flex items-center gap-2 text-expense">
          <AlertCircle className="h-4 w-4" />
          <p className="text-sm">ไม่สามารถโหลดข้อมูล Storage ได้</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <StatsCard
        title="จำนวนไฟล์สลิป"
        value={(data?.totalFiles || 0).toLocaleString()}
        icon={<FileImage className="h-5 w-5" />}
        variant="default"
      />
      <StatsCard
        title="พื้นที่ที่ใช้"
        value={formatSize(data?.totalSize || 0)}
        icon={<HardDrive className="h-5 w-5" />}
        variant="default"
      />
    </div>
  );
}
