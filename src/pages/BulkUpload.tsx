import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, CheckCircle, AlertCircle, ArrowLeft, Download, FileSpreadsheet, FolderOpen, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { CSVPreviewDialog, type CSVRow } from "@/components/csv-preview-dialog";
import { ImportHistory } from "@/components/import-history";

interface UploadedFile {
  file: File;
  status: 'pending' | 'uploading' | 'analyzing' | 'success' | 'error' | 'duplicate';
  error?: string;
  id?: string;
  confidence?: number;
}

const MAX_FILES = 100;
const CONCURRENCY = 3;

export default function BulkUpload() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewRows, setPreviewRows] = useState<CSVRow[]>([]);
  const [processedCount, setProcessedCount] = useState(0);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadCSVTemplate = () => {
    const headers = ['id','expense_date','amount','category','project','subcategory','merchant','description','sender','receiver','transaction_id'];
    const exampleRow = ['','2025-01-15','1500.00','ส่วนตัว','บริษัท','อาหาร','ร้านอาหาร ABC','ค่าอาหารกลางวัน','นายเอ','นายบี','TXN123456'];
    const csvContent = [headers.join(','), exampleRow.join(','), ',,,,,,,,,,'].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'expense_template.csv';
    link.click();
    toast({ title: "ดาวน์โหลดเทมเพลตสำเร็จ", description: "กรอกข้อมูลในไฟล์ CSV แล้วอัพโหลดกลับมา" });
  };

  const exportCurrentData = async () => {
    if (!user) { toast({ title: "กรุณาเข้าสู่ระบบ", variant: "destructive" }); return; }
    try {
      const { data, error } = await supabase.from('expenses').select('*').eq('user_id', user.id).order('expense_date', { ascending: false });
      if (error) throw error;
      if (!data?.length) { toast({ title: "ไม่มีข้อมูล", variant: "destructive" }); return; }
      const headers = ['id','expense_date','amount','category','project','subcategory','merchant','description','sender','receiver','transaction_id'];
      const rows = data.map(e => [e.id, e.expense_date, e.amount, e.category||'', e.project||'', e.subcategory||'', e.merchant||'', e.description||'', e.sender||'', e.receiver||'', e.transaction_id||'']);
      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `expenses_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      toast({ title: "Export สำเร็จ", description: `ดาวน์โหลดข้อมูล ${data.length} รายการแล้ว` });
    } catch { toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" }); }
  };

  const validateDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d).getTime());
  const validateAmount = (a: string) => { const n = parseFloat(a); return !isNaN(n) && n > 0; };

  const validateRow = (expense: any, rowNumber: number): CSVRow => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!expense.expense_date) errors.push('ไม่มีวันที่');
    else if (!validateDate(expense.expense_date)) errors.push('รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)');
    if (!expense.amount) errors.push('ไม่มีจำนวนเงิน');
    else if (!validateAmount(expense.amount)) errors.push('จำนวนเงินไม่ถูกต้อง');
    if (!expense.category) errors.push('ไม่มีประเภทค่าใช้จ่าย');
    if (!expense.description) warnings.push('ไม่มีรายละเอียด');
    if (!expense.project) warnings.push('ไม่ได้ระบุโปรเจค');
    return { rowNumber, data: expense, errors, warnings, isValid: errors.length === 0 };
  };

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) throw new Error('ไฟล์ CSV ว่างเปล่า');
        const headers = lines[0].split(',').map(h => h.trim());
        const validated: CSVRow[] = [];
        lines.slice(1).forEach((line, i) => {
          const values = line.split(',').map(v => v.trim());
          if (values.length !== headers.length) return;
          const expense: any = {};
          headers.forEach((h, hi) => { if (values[hi]) expense[h] = values[hi]; });
          validated.push(validateRow(expense, i + 2));
        });
        if (!validated.length) throw new Error('ไม่พบข้อมูลในไฟล์ CSV');
        setPreviewRows(validated);
        setShowPreview(true);
      } catch (err) {
        toast({ title: "เกิดข้อผิดพลาด", description: err instanceof Error ? err.message : "ไม่สามารถอ่านไฟล์ CSV ได้", variant: "destructive" });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const confirmImport = async () => {
    const validRows = previewRows.filter(r => r.isValid);
    if (!validRows.length) { toast({ title: "ไม่มีรายการที่ถูกต้อง", variant: "destructive" }); setShowPreview(false); return; }

    const { data: historyRecord, error: historyError } = await supabase.from('import_history').insert({
      user_id: user!.id, file_name: 'CSV Import', total_rows: previewRows.length, success_count: 0, update_count: 0, error_count: 0, import_type: 'csv', status: 'completed',
    }).select().single();
    if (historyError) { toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" }); setShowPreview(false); return; }

    let successCount = 0, errorCount = 0, updateCount = 0;
    const importItems: any[] = [];

    for (const row of validRows) {
      const expense = row.data;
      try {
        if (expense.id) {
          const { data: originalData } = await supabase.from('expenses').select('*').eq('id', expense.id).eq('user_id', user!.id).single();
          const { error } = await supabase.from('expenses').update({
            expense_date: expense.expense_date, amount: parseFloat(expense.amount), category: expense.category,
            project: expense.project || null, subcategory: expense.subcategory || null, merchant: expense.merchant || null,
            description: expense.description || null, sender: expense.sender || null, receiver: expense.receiver || null, transaction_id: expense.transaction_id || null,
          }).eq('id', expense.id).eq('user_id', user!.id);
          if (error) throw error;
          importItems.push({ import_history_id: historyRecord.id, expense_id: expense.id, action_type: 'update', row_number: row.rowNumber, row_data: originalData });
          updateCount++;
        } else {
          const { data: newExpense, error } = await supabase.from('expenses').insert({
            user_id: user!.id, expense_date: expense.expense_date, amount: parseFloat(expense.amount), category: expense.category,
            project: expense.project || null, subcategory: expense.subcategory || null, merchant: expense.merchant || null,
            description: expense.description || null, sender: expense.sender || null, receiver: expense.receiver || null, transaction_id: expense.transaction_id || null,
          }).select().single();
          if (error) throw error;
          importItems.push({ import_history_id: historyRecord.id, expense_id: newExpense.id, action_type: 'insert', row_number: row.rowNumber, row_data: expense });
          successCount++;
        }
      } catch { errorCount++; }
    }

    if (importItems.length > 0) await supabase.from('import_items').insert(importItems);
    await supabase.from('import_history').update({ success_count: successCount, update_count: updateCount, error_count: errorCount }).eq('id', historyRecord.id);

    const summary = [];
    if (successCount > 0) summary.push(`สร้างใหม่ ${successCount}`);
    if (updateCount > 0) summary.push(`อัพเดต ${updateCount}`);
    if (errorCount > 0) summary.push(`ล้มเหลว ${errorCount}`);
    toast({ title: "นำเข้าข้อมูลเสร็จสิ้น", description: summary.join(', ') });
    setShowPreview(false);
    setTimeout(() => navigate('/'), 1500);
  };

  const addFiles = useCallback((newFiles: File[]) => {
    const validFiles = newFiles.filter(f => f.type.startsWith('image/') || f.type === 'application/pdf');
    if (validFiles.length !== newFiles.length) {
      toast({ title: "คำเตือน", description: "รองรับเฉพาะรูปภาพและ PDF", variant: "destructive" });
    }

    setFiles(prev => {
      const total = prev.length + validFiles.length;
      if (total > MAX_FILES) {
        toast({ title: "จำกัดจำนวนไฟล์", description: `สูงสุด ${MAX_FILES} ไฟล์ต่อครั้ง (เลือกแล้ว ${prev.length}, ใหม่ ${validFiles.length})`, variant: "destructive" });
        return prev;
      }
      return [...prev, ...validFiles.map(file => ({ file, status: 'pending' as const }))];
    });
  }, [toast]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files || []));
    e.target.value = '';
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files || []));
    e.target.value = '';
  };

  const removeFile = (index: number) => setFiles(prev => prev.filter((_, i) => i !== index));

  const processFile = async (fileObj: UploadedFile, index: number, updatedFiles: UploadedFile[]) => {
    if (!user) return;

    updatedFiles[index].status = 'uploading';
    setFiles([...updatedFiles]);

    try {
      const fileExt = fileObj.file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}-${index}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('receipts').upload(fileName, fileObj.file);
      if (uploadError) throw uploadError;

      updatedFiles[index].status = 'analyzing';
      setFiles([...updatedFiles]);

      let amount = 0, expenseDate = new Date().toISOString().split('T')[0];
      let description = 'รอกรอกข้อมูล', merchant: string | null = null;
      let sender: string | null = null, receiver: string | null = null, transactionId: string | null = null;
      let expenseTime: string | null = null, confidence: number | null = null;
      let transactionType: string | null = null, categoryGroup: string | null = null;
      let projectTag: string | null = null, subcategory: string | null = null;
      let staffName: string | null = null, eventName: string | null = null;
      let memoText: string | null = null;

      const isPDF = fileObj.file.type === 'application/pdf';

      try {
        const { data: aiData, error: aiError } = await supabase.functions.invoke('analyze-receipt', {
          body: { storagePath: fileName, isPDF }
        });

        if (!aiError && aiData?.success && aiData.data) {
          const d = aiData.data;

          // Dedup check 1: transaction_id
          if (d.transaction_id) {
            const { data: existing } = await supabase.from('expenses').select('id').eq('user_id', user.id).eq('transaction_id', d.transaction_id).maybeSingle();
            if (existing) {
              updatedFiles[index].status = 'duplicate';
              updatedFiles[index].error = `สลิปซ้ำ (ID: ${d.transaction_id})`;
              setFiles([...updatedFiles]);
              return;
            }
          }

          // Dedup check 2: amount + date + time
          if (d.amount && d.date) {
            let dupQuery = supabase.from('expenses').select('id').eq('user_id', user.id).eq('amount', d.amount).eq('expense_date', d.date);
            if (d.time) dupQuery = dupQuery.eq('expense_time', d.time);
            const { data: dupByAmount } = await dupQuery.maybeSingle();
            if (dupByAmount) {
              updatedFiles[index].status = 'duplicate';
              updatedFiles[index].error = `สลิปซ้ำ (${d.amount} บาท, ${d.date}${d.time ? ' ' + d.time : ''})`;
              setFiles([...updatedFiles]);
              return;
            }
          }

          amount = d.amount || 0;
          expenseDate = d.date || expenseDate;
          description = d.description || 'รอกรอกข้อมูล';
          merchant = d.merchant || null;
          sender = d.sender || null;
          receiver = d.receiver || null;
          transactionId = d.transaction_id || null;
          expenseTime = d.time || null;
          confidence = d.confidence_score ?? null;
          transactionType = d.transaction_type || null;
          categoryGroup = d.category_group || null;
          projectTag = d.project_tag || null;
          subcategory = d.subcategory || null;
          staffName = d.staff_name || null;
          eventName = d.event_name || null;
          memoText = d.memo_text || null;
        }
      } catch (aiErr) {
        console.error('[BulkUpload] AI error:', aiErr);
      }

      const isLowConfidence = confidence != null && confidence < 75;
      const category = transactionType === 'BUSINESS' && categoryGroup ? `${transactionType}/${categoryGroup}` : transactionType || 'ไม่ระบุ';

      const { data, error: insertError } = await supabase.from('expenses').insert({
        user_id: user.id, amount, expense_date: expenseDate, expense_time: expenseTime,
        category, subcategory, description, merchant, sender, receiver,
        receipt_url: fileName, transaction_id: transactionId,
        transaction_type: transactionType, category_group: categoryGroup,
        project_tag: projectTag, confidence_score: confidence,
        needs_review: isLowConfidence, staff_name: staffName,
        event_name: eventName, memo_text: memoText,
      }).select().single();

      if (insertError) throw insertError;

      updatedFiles[index].status = 'success';
      updatedFiles[index].id = data.id;
      updatedFiles[index].confidence = confidence ?? undefined;
    } catch (error) {
      updatedFiles[index].status = 'error';
      updatedFiles[index].error = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด';
    }

    setFiles([...updatedFiles]);
    setProcessedCount(prev => prev + 1);
  };

  const uploadAll = async () => {
    if (!user) { toast({ title: "กรุณาเข้าสู่ระบบ", variant: "destructive" }); return; }

    setUploading(true);
    setProcessedCount(0);
    const updatedFiles = [...files];
    const pendingIndices = updatedFiles.map((f, i) => f.status === 'pending' ? i : -1).filter(i => i !== -1);

    // Process in batches of CONCURRENCY
    for (let i = 0; i < pendingIndices.length; i += CONCURRENCY) {
      const batch = pendingIndices.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(idx => processFile(updatedFiles[idx], idx, updatedFiles)));
    }

    setUploading(false);

    const successCount = updatedFiles.filter(f => f.status === 'success').length;
    const errorCount = updatedFiles.filter(f => f.status === 'error').length;
    const dupCount = updatedFiles.filter(f => f.status === 'duplicate').length;
    const lowConfCount = updatedFiles.filter(f => f.status === 'success' && f.confidence != null && f.confidence < 75).length;

    let desc = `สำเร็จ ${successCount} ไฟล์`;
    if (dupCount > 0) desc += `, ซ้ำ ${dupCount}`;
    if (errorCount > 0) desc += `, ล้มเหลว ${errorCount}`;
    if (lowConfCount > 0) desc += ` | ⚠️ ${lowConfCount} รายการรอตรวจสอบ`;

    toast({ title: "อัพโหลดเสร็จสิ้น", description: desc });
  };

  const getStatusIcon = (status: UploadedFile['status']) => {
    switch (status) {
      case 'success': return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'error': return <AlertCircle className="h-5 w-5 text-destructive" />;
      case 'duplicate': return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case 'uploading': case 'analyzing':
        return <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />;
      default: return null;
    }
  };

  const getStatusLabel = (f: UploadedFile) => {
    if (f.status === 'analyzing') return 'AI กำลังวิเคราะห์...';
    if (f.status === 'uploading') return 'กำลังอัพโหลด...';
    if (f.status === 'duplicate') return f.error;
    if (f.status === 'error') return f.error;
    if (f.status === 'success' && f.confidence != null && f.confidence < 75) return `⚠️ ความมั่นใจ ${f.confidence}% — รอตรวจสอบ`;
    return null;
  };

  const pendingCount = files.filter(f => f.status === 'pending').length;
  const totalToProcess = files.length;
  const progressPercent = totalToProcess > 0 ? Math.round((processedCount / totalToProcess) * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">อัพโหลดหลายรายการ</h1>
            <p className="text-muted-foreground">อัพโหลดใบเสร็จสูงสุด {MAX_FILES} ไฟล์ หรือเลือกทั้งโฟลเดอร์ พร้อม AI วิเคราะห์และตรวจซ้ำอัตโนมัติ</p>
          </div>
        </div>

        {/* CSV Upload Section */}
        <Card className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-green-200 dark:border-green-800">
          <div className="flex items-start gap-4">
            <FileSpreadsheet className="h-8 w-8 text-green-600 dark:text-green-400 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold mb-2 text-green-900 dark:text-green-100">นำเข้าข้อมูลจาก CSV</h3>
              <p className="text-sm text-green-800 dark:text-green-200 mb-4">ดาวน์โหลดเทมเพลต กรอกข้อมูล แล้วอัพโหลดกลับมา</p>
              <div className="flex flex-wrap gap-3">
                <Button onClick={downloadCSVTemplate} variant="outline" className="bg-white dark:bg-gray-900">
                  <Download className="h-4 w-4 mr-2" />ดาวน์โหลดเทมเพลต
                </Button>
                <Button onClick={exportCurrentData} variant="outline" className="bg-white dark:bg-gray-900">
                  <Download className="h-4 w-4 mr-2" />Export ข้อมูลที่มีอยู่
                </Button>
                <input type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" id="csv-upload" />
                <Button asChild className="bg-green-600 hover:bg-green-700">
                  <label htmlFor="csv-upload" className="cursor-pointer"><Upload className="h-4 w-4 mr-2" />อัพโหลด CSV</label>
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Receipt Upload Section */}
        <div>
          <h2 className="text-xl font-semibold mb-4">หรืออัพโหลดใบเสร็จ</h2>
          <Card className="p-8">
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-12 text-center hover:border-primary/50 transition-colors">
              <Upload className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">เลือกไฟล์ใบเสร็จ</h3>
              <p className="text-sm text-muted-foreground mb-4">
                รองรับ JPG, PNG, WEBP, PDF — สูงสุด {MAX_FILES} ไฟล์ต่อครั้ง — ประมวลผลพร้อมกัน {CONCURRENCY} ไฟล์
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <input ref={fileInputRef} type="file" multiple accept="image/*,application/pdf" onChange={handleFileSelect} className="hidden" id="file-upload" disabled={uploading} />
                <Button asChild disabled={uploading}>
                  <label htmlFor="file-upload" className="cursor-pointer"><Upload className="h-4 w-4 mr-2" />เลือกไฟล์</label>
                </Button>
                <input
                  ref={folderInputRef}
                  type="file"
                  // @ts-ignore
                  webkitdirectory=""
                  // @ts-ignore
                  directory=""
                  multiple
                  onChange={handleFolderSelect}
                  className="hidden"
                  id="folder-upload"
                  disabled={uploading}
                />
                <Button asChild variant="outline" disabled={uploading}>
                  <label htmlFor="folder-upload" className="cursor-pointer"><FolderOpen className="h-4 w-4 mr-2" />เลือกโฟลเดอร์</label>
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* Progress Bar */}
        {uploading && (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">กำลังประมวลผล...</span>
              <span className="text-sm text-muted-foreground">{processedCount}/{totalToProcess} ({progressPercent}%)</span>
            </div>
            <Progress value={progressPercent} className="h-3" />
          </Card>
        )}

        {/* File List */}
        {files.length > 0 && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">ไฟล์ที่เลือก ({files.length} ไฟล์)</h3>
              <div className="flex gap-2">
                {!uploading && files.some(f => f.status === 'success' && f.confidence != null && f.confidence < 75) && (
                  <Button variant="outline" onClick={() => navigate('/review-queue')}>
                    <AlertTriangle className="h-4 w-4 mr-2" />รอตรวจสอบ
                  </Button>
                )}
                <Button onClick={uploadAll} disabled={uploading || pendingCount === 0}>
                  {uploading ? 'กำลังอัพโหลด...' : `อัพโหลดทั้งหมด (${pendingCount})`}
                </Button>
              </div>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {files.map((fileObj, index) => (
                <div key={index} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <div className="flex-shrink-0">{getStatusIcon(fileObj.status)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{fileObj.file.name}</p>
                    <p className="text-xs text-muted-foreground">{(fileObj.file.size / 1024).toFixed(1)} KB</p>
                    {getStatusLabel(fileObj) && (
                      <p className={`text-xs mt-1 ${fileObj.status === 'error' ? 'text-destructive' : fileObj.status === 'duplicate' ? 'text-yellow-600' : 'text-warning'}`}>
                        {getStatusLabel(fileObj)}
                      </p>
                    )}
                  </div>
                  {fileObj.status === 'pending' && (
                    <Button variant="ghost" size="icon" onClick={() => removeFile(index)} className="flex-shrink-0">
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Instructions */}
        <Card className="p-6 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
          <h4 className="font-semibold mb-2 text-blue-900 dark:text-blue-100">📝 คำแนะนำ</h4>
          <div className="space-y-3">
            <div>
              <p className="font-medium text-sm text-blue-900 dark:text-blue-100 mb-1">สำหรับ CSV:</p>
              <ul className="space-y-1 text-sm text-blue-800 dark:text-blue-200">
                <li>• <strong>ดาวน์โหลดเทมเพลต</strong> = สร้างรายการใหม่ (ไม่ต้องใส่ ID)</li>
                <li>• <strong>Export ข้อมูล</strong> = แก้ไขรายการที่มีอยู่ (มี ID แล้ว)</li>
                <li>• ฟิลด์ที่จำเป็น: expense_date, amount, category</li>
                <li>• วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-sm text-blue-900 dark:text-blue-100 mb-1">สำหรับใบเสร็จ:</p>
              <ul className="space-y-1 text-sm text-blue-800 dark:text-blue-200">
                <li>• อัพโหลดได้สูงสุด {MAX_FILES} ไฟล์ หรือเลือกทั้งโฟลเดอร์</li>
                <li>• ประมวลผลพร้อมกัน {CONCURRENCY} ไฟล์ พร้อมแถบ Progress</li>
                <li>• ตรวจซ้ำ 2 ระดับ: Transaction ID และ ยอดเงิน+วันที่+เวลา</li>
                <li>• AI จัดหมวดหมู่อัตโนมัติ (BUSINESS/PERSONAL/TRANSFER)</li>
                <li>• รายการที่ AI ไม่มั่นใจ ({"<"}75%) จะถูกติดธง "รอตรวจสอบ"</li>
              </ul>
            </div>
          </div>
        </Card>

        <ImportHistory />

        <CSVPreviewDialog open={showPreview} onOpenChange={setShowPreview} rows={previewRows} onConfirm={confirmImport} onCancel={() => setShowPreview(false)} />
      </div>
    </div>
  );
}
