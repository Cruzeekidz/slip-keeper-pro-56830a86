import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Folder, ExternalLink, ChevronRight, Eye } from "lucide-react";
import { useExpensesRealtime } from "@/hooks/useExpensesRealtime";
import { useNavigate } from "react-router-dom";

interface ProjectSummaryData {
  tag: string;
  totalAmount: number;
  count: number;
}

interface ExpenseDetail {
  id: string;
  amount: number;
  expense_date: string;
  description: string | null;
  merchant: string | null;
  subcategory: string | null;
  category_group: string | null;
  transaction_type: string | null;
  project_tag: string | null;
  receipt_url: string | null;
}

export function ProjectSummary() {
  const [projectData, setProjectData] = useState<ProjectSummaryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewBy, setViewBy] = useState<"project_tag" | "category_group">("project_tag");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [details, setDetails] = useState<ExpenseDetail[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchSummary();
  }, [viewBy]);

  useExpensesRealtime(useCallback(() => fetchSummary(), [viewBy]));

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const { data: expenses, error } = await supabase
        .from('expenses')
        .select('project_tag, category_group, transaction_type, amount');

      if (error) throw error;

      const map = new Map<string, { totalAmount: number; count: number }>();

      expenses?.forEach(expense => {
        if (expense.transaction_type === 'TRANSFER') return;

        const key = viewBy === "project_tag"
          ? expense.project_tag || 'ไม่ระบุแท็ก'
          : expense.transaction_type === 'BUSINESS'
            ? expense.category_group || 'ไม่ระบุกลุ่ม'
            : expense.transaction_type || 'ไม่ระบุ';

        const current = map.get(key) || { totalAmount: 0, count: 0 };
        map.set(key, { totalAmount: current.totalAmount + expense.amount, count: current.count + 1 });
      });

      const summaries = Array.from(map.entries())
        .map(([tag, data]) => ({ tag, ...data }))
        .sort((a, b) => b.totalAmount - a.totalAmount);

      setProjectData(summaries);
    } catch (error) {
      console.error('Error fetching project summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDetails = async (tag: string) => {
    setSelectedTag(tag);
    setDetailLoading(true);
    try {
      let query = supabase
        .from('expenses')
        .select('id, amount, expense_date, description, merchant, subcategory, category_group, transaction_type, project_tag, receipt_url')
        .neq('transaction_type', 'TRANSFER')
        .order('expense_date', { ascending: false })
        .limit(500);

      if (viewBy === "project_tag") {
        if (tag === 'ไม่ระบุแท็ก') {
          query = query.is('project_tag', null);
        } else {
          query = query.eq('project_tag', tag);
        }
      } else {
        // category_group view
        if (tag === 'ไม่ระบุกลุ่ม') {
          query = query.eq('transaction_type', 'BUSINESS').is('category_group', null);
        } else if (tag === 'PERSONAL' || tag === 'BUSINESS') {
          query = query.eq('transaction_type', tag);
        } else {
          query = query.eq('category_group', tag);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      setDetails(data || []);
    } catch (error) {
      console.error('Error fetching details:', error);
    } finally {
      setDetailLoading(false);
    }
  };

  if (loading) return <Card className="p-6"><p className="text-muted-foreground">กำลังโหลด...</p></Card>;

  return (
    <>
      <Card className="p-6 bg-gradient-card shadow-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Folder className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold text-foreground">สรุปยอด (ไม่รวม TRANSFER)</h2>
          </div>
          <Select value={viewBy} onValueChange={(v) => setViewBy(v as any)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="project_tag">ตามแท็กโปรเจค</SelectItem>
              <SelectItem value="category_group">ตามกลุ่ม</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{viewBy === "project_tag" ? "แท็กโปรเจค" : "กลุ่ม"}</TableHead>
                <TableHead className="text-right">จำนวน</TableHead>
                <TableHead className="text-right">ยอดรวม</TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectData.map((item) => (
                <TableRow
                  key={item.tag}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => fetchDetails(item.tag)}
                >
                  <TableCell className="font-medium">{item.tag}</TableCell>
                  <TableCell className="text-right">{item.count}</TableCell>
                  <TableCell className="text-right font-semibold text-expense">฿{item.totalAmount.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={!!selectedTag} onOpenChange={(open) => !open && setSelectedTag(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Folder className="h-5 w-5 text-primary" />
              {selectedTag}
              <span className="text-sm font-normal text-muted-foreground">
                ({details.length} รายการ)
              </span>
            </DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-auto flex-1 -mx-6 px-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>วันที่</TableHead>
                    <TableHead>รายละเอียด</TableHead>
                    <TableHead>ประเภทย่อย</TableHead>
                    <TableHead className="text-right">จำนวนเงิน</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {details.map((item) => (
                    <TableRow key={item.id} className="group">
                      <TableCell className="text-sm whitespace-nowrap">{item.expense_date}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">
                        {item.description || item.merchant || '-'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.subcategory || '-'}</TableCell>
                      <TableCell className="text-right font-medium text-expense whitespace-nowrap">
                        ฿{item.amount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTag(null);
                            navigate(`/?edit=${item.id}`);
                          }}
                          title="ดู/แก้ไข"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {details.length === 0 && (
                <p className="text-center text-muted-foreground py-8">ไม่พบรายการ</p>
              )}
              {details.length > 0 && (
                <div className="py-3 border-t flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{details.length} รายการ</span>
                  <span className="font-semibold text-expense">
                    รวม ฿{details.reduce((sum, d) => sum + d.amount, 0).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
