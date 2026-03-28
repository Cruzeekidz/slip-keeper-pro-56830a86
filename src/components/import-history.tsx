import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { History, RotateCcw, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ImportHistory {
  id: string;
  imported_at: string;
  file_name: string | null;
  source_folder: string | null;
  total_rows: number;
  success_count: number;
  update_count: number;
  error_count: number;
  import_type: string;
  status: string;
  rolled_back_at: string | null;
  notes: string | null;
}

interface ImportItem {
  id: string;
  expense_id: string;
  action_type: string;
  row_number: number | null;
  row_data: any;
}

export function ImportHistory() {
  const [history, setHistory] = useState<ImportHistory[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, ImportItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [rollbackId, setRollbackId] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchHistory();
    }
  }, [user]);

  const fetchHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('import_history')
        .select('*')
        .eq('user_id', user!.id)
        .order('imported_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setHistory(data || []);
    } catch (error) {
      console.error('Error fetching import history:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถโหลดประวัติการ import ได้",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchItems = async (importId: string) => {
    if (items[importId]) return; // Already loaded

    try {
      const { data, error } = await supabase
        .from('import_items')
        .select('*')
        .eq('import_history_id', importId)
        .order('row_number', { ascending: true });

      if (error) throw error;
      setItems(prev => ({ ...prev, [importId]: data || [] }));
    } catch (error) {
      console.error('Error fetching import items:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถโหลดรายละเอียดการ import ได้",
        variant: "destructive",
      });
    }
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      fetchItems(id);
    }
  };

  const handleRollback = async () => {
    if (!rollbackId) return;

    try {
      const importItems = items[rollbackId];
      if (!importItems || importItems.length === 0) {
        throw new Error('ไม่พบรายการที่จะ rollback');
      }

      let deletedCount = 0;
      let restoredCount = 0;

      // Rollback in reverse order
      for (const item of importItems) {
        try {
          if (item.action_type === 'insert') {
            // Delete the inserted record
            const { error } = await supabase
              .from('expenses')
              .delete()
              .eq('id', item.expense_id)
              .eq('user_id', user!.id);

            if (error) throw error;
            deletedCount++;
          } else if (item.action_type === 'update') {
            // Restore the original data
            const originalData = item.row_data;
            const { error } = await supabase
              .from('expenses')
              .update({
                expense_date: originalData.expense_date,
                amount: originalData.amount,
                category: originalData.category,
                project: originalData.project,
                subcategory: originalData.subcategory,
                merchant: originalData.merchant,
                description: originalData.description,
                sender: originalData.sender,
                receiver: originalData.receiver,
                transaction_id: originalData.transaction_id,
              })
              .eq('id', item.expense_id)
              .eq('user_id', user!.id);

            if (error) throw error;
            restoredCount++;
          }
        } catch (err) {
          console.error('Error rolling back item:', err);
        }
      }

      // Update import history status
      await supabase
        .from('import_history')
        .update({
          status: 'rolled_back',
          rolled_back_at: new Date().toISOString(),
        })
        .eq('id', rollbackId)
        .eq('user_id', user!.id);

      toast({
        title: "Rollback สำเร็จ",
        description: `ลบ ${deletedCount} รายการ, คืนค่า ${restoredCount} รายการ`,
      });

      fetchHistory();
      setRollbackId(null);
    } catch (error) {
      console.error('Error during rollback:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: error instanceof Error ? error.message : "ไม่สามารถ rollback ได้",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (importId: string) => {
    try {
      const { error } = await supabase
        .from('import_history')
        .delete()
        .eq('id', importId)
        .eq('user_id', user!.id);

      if (error) throw error;

      toast({
        title: "ลบสำเร็จ",
        description: "ลบประวัติการ import แล้ว",
      });

      fetchHistory();
    } catch (error) {
      console.error('Error deleting import history:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถลบประวัติได้",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center">
          <p className="text-muted-foreground">กำลังโหลด...</p>
        </div>
      </Card>
    );
  }

  if (history.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center justify-center py-8">
          <History className="h-12 w-12 text-muted-foreground mb-3" />
          <p className="text-muted-foreground">ยังไม่มีประวัติการ import</p>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <History className="h-5 w-5" />
          <h3 className="text-lg font-semibold">ประวัติการ Import</h3>
        </div>

        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-3">
            {history.map((record) => (
              <div
                key={record.id}
                className={`border rounded-lg p-4 ${
                  record.status === 'rolled_back'
                    ? 'bg-gray-50 dark:bg-gray-900/20 border-gray-300 dark:border-gray-700'
                    : 'bg-white dark:bg-gray-950'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant={record.status === 'rolled_back' ? 'secondary' : 'default'}>
                        {record.status === 'rolled_back' ? 'Rolled Back' : 'สำเร็จ'}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(record.imported_at), 'dd/MM/yyyy HH:mm')}
                      </span>
                      {record.file_name && (
                        <span className="text-xs text-muted-foreground">
                          • {record.file_name}
                          {record.source_folder && (
                            <span className="ml-1 font-medium text-foreground">({record.source_folder})</span>
                          )}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">ทั้งหมด:</span>{' '}
                        <span className="font-semibold">{record.total_rows}</span>
                      </div>
                      {record.success_count > 0 && (
                        <div>
                          <span className="text-muted-foreground">สร้างใหม่:</span>{' '}
                          <span className="font-semibold text-green-600">{record.success_count}</span>
                        </div>
                      )}
                      {record.update_count > 0 && (
                        <div>
                          <span className="text-muted-foreground">อัพเดต:</span>{' '}
                          <span className="font-semibold text-blue-600">{record.update_count}</span>
                        </div>
                      )}
                      {record.error_count > 0 && (
                        <div>
                          <span className="text-muted-foreground">ผิดพลาด:</span>{' '}
                          <span className="font-semibold text-red-600">{record.error_count}</span>
                        </div>
                      )}
                     </div>

                    {record.notes && (
                      <p className="text-xs text-muted-foreground mt-1">
                        📋 {record.notes}
                      </p>
                    )}

                    {record.rolled_back_at && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Rolled back: {format(new Date(record.rolled_back_at), 'dd/MM/yyyy HH:mm')}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {record.status !== 'rolled_back' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRollbackId(record.id)}
                      >
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Rollback
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(record.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleExpand(record.id)}
                    >
                      {expandedId === record.id ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedId === record.id && items[record.id] && (
                  <div className="mt-4 pt-4 border-t">
                    <h4 className="text-sm font-semibold mb-2">รายละเอียด:</h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {items[record.id].map((item) => (
                        <div
                          key={item.id}
                          className="text-xs p-2 bg-muted rounded flex items-start gap-2"
                        >
                          <Badge variant="outline" className="text-xs">
                            {item.action_type === 'insert' ? 'INSERT' : 'UPDATE'}
                          </Badge>
                          <div className="flex-1">
                            <div>
                              <span className="font-semibold">วันที่:</span> {item.row_data?.expense_date || '-'}
                              {' | '}
                              <span className="font-semibold">จำนวน:</span> {item.row_data?.amount || '-'}
                              {' | '}
                              <span className="font-semibold">ประเภท:</span> {item.row_data?.category || '-'}
                            </div>
                            {item.row_data?.description && (
                              <div className="text-muted-foreground mt-1">
                                {item.row_data.description}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </Card>

      {/* Rollback Confirmation Dialog */}
      <AlertDialog open={!!rollbackId} onOpenChange={(open) => !open && setRollbackId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการ Rollback</AlertDialogTitle>
            <AlertDialogDescription>
              คุณแน่ใจหรือไม่ว่าต้องการย้อนกลับการ import นี้?
              <br />
              <br />
              • รายการที่สร้างใหม่จะถูก<strong className="text-red-600">ลบออก</strong>
              <br />
              • รายการที่อัพเดตจะถูก<strong className="text-blue-600">คืนค่าเดิม</strong>
              <br />
              <br />
              การดำเนินการนี้<strong>ไม่สามารถย้อนกลับได้</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={handleRollback}>
              ยืนยัน Rollback
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
