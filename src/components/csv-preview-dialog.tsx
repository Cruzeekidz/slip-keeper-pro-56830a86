import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, AlertTriangle } from "lucide-react";

export interface CSVRow {
  rowNumber: number;
  data: {
    id?: string;
    expense_date: string;
    amount: string;
    category: string;
    project?: string;
    subcategory?: string;
    merchant?: string;
    description?: string;
    sender?: string;
    receiver?: string;
    transaction_id?: string;
  };
  errors: string[];
  warnings: string[];
  isValid: boolean;
}

interface CSVPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: CSVRow[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function CSVPreviewDialog({
  open,
  onOpenChange,
  rows,
  onConfirm,
  onCancel,
}: CSVPreviewDialogProps) {
  const validRows = rows.filter(r => r.isValid);
  const invalidRows = rows.filter(r => !r.isValid);
  const warningRows = rows.filter(r => r.warnings.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>ตรวจสอบข้อมูลก่อน Import</DialogTitle>
        </DialogHeader>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <div className="text-2xl font-bold text-green-700 dark:text-green-400">{validRows.length}</div>
                <div className="text-xs text-green-600 dark:text-green-500">รายการถูกต้อง</div>
              </div>
            </div>
          </div>
          
          <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <div>
                <div className="text-2xl font-bold text-red-700 dark:text-red-400">{invalidRows.length}</div>
                <div className="text-xs text-red-600 dark:text-red-500">รายการผิดพลาด</div>
              </div>
            </div>
          </div>

          <div className="p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <div>
                <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{warningRows.length}</div>
                <div className="text-xs text-yellow-600 dark:text-yellow-500">มีคำเตือน</div>
              </div>
            </div>
          </div>
        </div>

        {/* Rows Preview */}
        <ScrollArea className="h-[400px] border rounded-md">
          <div className="p-4 space-y-3">
            {rows.map((row) => (
              <div
                key={row.rowNumber}
                className={`p-3 rounded-lg border ${
                  !row.isValid
                    ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
                    : row.warnings.length > 0
                    ? 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800'
                    : 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 pt-1">
                    {!row.isValid ? (
                      <AlertCircle className="h-5 w-5 text-red-600" />
                    ) : row.warnings.length > 0 ? (
                      <AlertTriangle className="h-5 w-5 text-yellow-600" />
                    ) : (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs">
                        แถว {row.rowNumber}
                      </Badge>
                      {row.data.id && (
                        <Badge variant="secondary" className="text-xs">
                          UPDATE
                        </Badge>
                      )}
                      {!row.data.id && (
                        <Badge variant="default" className="text-xs">
                          INSERT
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs mb-2">
                      <div>
                        <span className="font-semibold">วันที่:</span> {row.data.expense_date || '-'}
                      </div>
                      <div>
                        <span className="font-semibold">จำนวน:</span> {row.data.amount || '-'}
                      </div>
                      <div>
                        <span className="font-semibold">ประเภท:</span> {row.data.category || '-'}
                      </div>
                      {row.data.project && (
                        <div>
                          <span className="font-semibold">โปรเจค:</span> {row.data.project}
                        </div>
                      )}
                      {row.data.merchant && (
                        <div>
                          <span className="font-semibold">ร้านค้า:</span> {row.data.merchant}
                        </div>
                      )}
                      {row.data.description && (
                        <div className="col-span-2 md:col-span-3">
                          <span className="font-semibold">รายละเอียด:</span> {row.data.description}
                        </div>
                      )}
                    </div>

                    {/* Errors */}
                    {row.errors.length > 0 && (
                      <div className="space-y-1">
                        {row.errors.map((error, idx) => (
                          <div key={idx} className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1">
                            <span className="font-semibold">❌</span>
                            <span>{error}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Warnings */}
                    {row.warnings.length > 0 && (
                      <div className="space-y-1">
                        {row.warnings.map((warning, idx) => (
                          <div key={idx} className="text-xs text-yellow-600 dark:text-yellow-400 flex items-start gap-1">
                            <span className="font-semibold">⚠️</span>
                            <span>{warning}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter>
          <div className="w-full">
            {invalidRows.length > 0 && (
              <p className="text-sm text-red-600 dark:text-red-400 mb-3">
                ⚠️ จะนำเข้าเฉพาะรายการที่ถูกต้อง ({validRows.length} รายการ) และข้ามรายการที่ผิดพลาด ({invalidRows.length} รายการ)
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={onCancel}>
                ยกเลิก
              </Button>
              <Button 
                onClick={onConfirm}
                disabled={validRows.length === 0}
              >
                ยืนยันการนำเข้า ({validRows.length} รายการ)
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
