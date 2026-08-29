import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface PendingCounts {
  needs_review: number;
  duplicates: number;
  missing_tag: number;
  suspicious_date: number;
}

async function fetchPendingCounts(): Promise<PendingCounts> {
  const { data, error } = await supabase.rpc("get_pending_counts");
  if (error) throw error;
  const d = (data ?? {}) as Partial<Record<keyof PendingCounts, number>>;
  return {
    needs_review: Number(d.needs_review ?? 0),
    duplicates: Number(d.duplicates ?? 0),
    missing_tag: Number(d.missing_tag ?? 0),
    suspicious_date: Number(d.suspicious_date ?? 0),
  };
}

export function PendingTasksBar() {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ["pending-counts"],
    queryFn: fetchPendingCounts,
    staleTime: 60_000,
  });

  const items = [
    { label: "รอตรวจ", count: data?.needs_review ?? 0, to: "/review-queue" },
    { label: "รายการซ้ำ", count: data?.duplicates ?? 0, to: "/duplicate-checker" },
    { label: "ยังไม่มีรหัสงาน", count: data?.missing_tag ?? 0, to: "/?filter=notag" },
    { label: "วันที่น่าสงสัย", count: data?.suspicious_date ?? 0, to: "/review-queue?filter=date" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/60 p-2">
      {items.map((it) => (
        <button
          key={it.label}
          onClick={() => navigate(it.to)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm transition-colors",
            it.count > 0
              ? "bg-warning/15 text-warning hover:bg-warning/25 font-medium"
              : "text-muted-foreground/50 hover:text-muted-foreground"
          )}
        >
          {it.label} <span className="font-semibold">{it.count}</span>
        </button>
      ))}
    </div>
  );
}
