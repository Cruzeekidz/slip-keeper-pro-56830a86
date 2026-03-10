import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { HardDrive, FileImage, AlertCircle } from "lucide-react";
import { StatsCard } from "@/components/ui/stats-card";
import { useExpensesRealtime } from "@/hooks/useExpensesRealtime";

export function StorageStats() {
  const [stats, setStats] = useState({
    totalFiles: 0,
    totalSize: 0,
    loading: true,
    error: false
  });

  useEffect(() => {
    fetchStorageStats();
  }, []);

  useExpensesRealtime(useCallback(() => fetchStorageStats(), []));

  const fetchStorageStats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get all receipt URLs from expenses
      const { data: expenses, error } = await supabase
        .from('expenses')
        .select('receipt_url')
        .eq('user_id', user.id)
        .not('receipt_url', 'is', null);

      if (error) throw error;

      // Count files
      const totalFiles = expenses?.length || 0;

      // Get file sizes from storage
      let totalSize = 0;
      if (expenses && expenses.length > 0) {
        const { data: fileList, error: listError } = await supabase.storage
          .from('receipts')
          .list(user.id, {
            limit: 1000,
            sortBy: { column: 'created_at', order: 'desc' }
          });

        if (!listError && fileList) {
          totalSize = fileList.reduce((sum, file) => sum + (file.metadata?.size || 0), 0);
        }
      }

      setStats({
        totalFiles,
        totalSize,
        loading: false,
        error: false
      });
    } catch (error) {
      console.error('Error fetching storage stats:', error);
      setStats(prev => ({ ...prev, loading: false, error: true }));
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  if (stats.loading) {
    return null; // Don't show while loading
  }

  if (stats.error) {
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
        value={stats.totalFiles.toLocaleString()}
        icon={<FileImage className="h-5 w-5" />}
        variant="default"
      />
      <StatsCard
        title="พื้นที่ที่ใช้"
        value={formatSize(stats.totalSize)}
        icon={<HardDrive className="h-5 w-5" />}
        variant="default"
      />
    </div>
  );
}
