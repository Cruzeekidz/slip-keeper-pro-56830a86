import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, CheckCircle, AlertCircle, ArrowLeft, Download, FileSpreadsheet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { CSVPreviewDialog, type CSVRow } from "@/components/csv-preview-dialog";
import { ImportHistory } from "@/components/import-history";

interface UploadedFile {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  id?: string;
}

export default function BulkUpload() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewRows, setPreviewRows] = useState<CSVRow[]>([]);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();

  const downloadCSVTemplate = () => {
    const headers = [
      'id',
      'expense_date',
      'amount', 
      'category',
      'project',
      'subcategory',
      'merchant',
      'description',
      'sender',
      'receiver',
      'transaction_id'
    ];

    const exampleRow = [
      '', // ไม่ใส่ ID = สร้างรายการใหม่
      '2025-01-15',
      '1500.00',
      'ส่วนตัว',
      'บริษัท',
      'อาหาร',
      'ร้านอาหาร ABC',
      'ค่าอาหารกลางวัน',
      'นายเอ',
      'นายบี',
      'TXN123456'
    ];

    const csvContent = [
      headers.join(','),
      exampleRow.join(','),
      ',,,,,,,,,,' // Empty row for user to fill
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'expense_template.csv';
    link.click();
    
    toast({
      title: "ดาวน์โหลดเทมเพลตสำเร็จ",
      description: "กรอกข้อมูลในไฟล์ CSV แล้วอัพโหลดกลับมา (ไม่ต้องใส่ ID สำหรับรายการใหม่)",
    });
  };

  const exportCurrentData = async () => {
    if (!user) {
      toast({
        title: "กรุณาเข้าสู่ระบบ",
        description: "คุณต้องเข้าสู่ระบบก่อน Export ข้อมูล",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('user_id', user.id)
        .order('expense_date', { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        toast({
          title: "ไม่มีข้อมูล",
          description: "ยังไม่มีรายการค่าใช้จ่ายในระบบ",
          variant: "destructive",
        });
        return;
      }

      const headers = [
        'id',
        'expense_date',
        'amount', 
        'category',
        'project',
        'subcategory',
        'merchant',
        'description',
        'sender',
        'receiver',
        'transaction_id'
      ];

      const rows = data.map(expense => [
        expense.id,
        expense.expense_date,
        expense.amount,
        expense.category || '',
        expense.project || '',
        expense.subcategory || '',
        expense.merchant || '',
        expense.description || '',
        expense.sender || '',
        expense.receiver || '',
        expense.transaction_id || ''
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');

      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `expenses_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      
      toast({
        title: "Export สำเร็จ",
        description: `ดาวน์โหลดข้อมูล ${data.length} รายการแล้ว (แก้ไขแล้ว upload กลับมาได้)`,
      });
    } catch (error) {
      console.error('Error exporting data:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถ Export ข้อมูลได้",
        variant: "destructive",
      });
    }
  };

  // Validation functions
  const validateDate = (dateStr: string): boolean => {
    if (!dateStr) return false;
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateStr)) return false;
    const date = new Date(dateStr);
    return date instanceof Date && !isNaN(date.getTime());
  };

  const validateAmount = (amountStr: string): boolean => {
    if (!amountStr) return false;
    const amount = parseFloat(amountStr);
    return !isNaN(amount) && amount > 0;
  };

  const validateRow = (expense: any, rowNumber: number): CSVRow => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required field validation
    if (!expense.expense_date) {
      errors.push('ไม่มีวันที่');
    } else if (!validateDate(expense.expense_date)) {
      errors.push('รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)');
    }

    if (!expense.amount) {
      errors.push('ไม่มีจำนวนเงิน');
    } else if (!validateAmount(expense.amount)) {
      errors.push('จำนวนเงินไม่ถูกต้อง (ต้องเป็นตัวเลขที่มากกว่า 0)');
    }

    if (!expense.category) {
      errors.push('ไม่มีประเภทค่าใช้จ่าย');
    }

    // Warnings
    if (!expense.description) {
      warnings.push('ไม่มีรายละเอียด');
    }

    if (!expense.project) {
      warnings.push('ไม่ได้ระบุโปรเจค');
    }

    return {
      rowNumber,
      data: expense,
      errors,
      warnings,
      isValid: errors.length === 0,
    };
  };

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!user) {
      toast({
        title: "กรุณาเข้าสู่ระบบ",
        description: "คุณต้องเข้าสู่ระบบก่อนอัพโหลด",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
          throw new Error('ไฟล์ CSV ว่างเปล่า');
        }

        const headers = lines[0].split(',').map(h => h.trim());
        const dataLines = lines.slice(1);

        // Parse and validate all rows
        const validatedRows: CSVRow[] = [];
        
        dataLines.forEach((line, index) => {
          const values = line.split(',').map(v => v.trim());
          
          if (values.length !== headers.length) return;

          const expense: any = {};
          headers.forEach((header, headerIndex) => {
            const value = values[headerIndex];
            if (value) {
              expense[header] = value;
            }
          });

          const validatedRow = validateRow(expense, index + 2); // +2 because row 1 is header, and index starts at 0
          validatedRows.push(validatedRow);
        });

        if (validatedRows.length === 0) {
          throw new Error('ไม่พบข้อมูลในไฟล์ CSV');
        }

        // Show preview dialog
        setPreviewRows(validatedRows);
        setShowPreview(true);
      } catch (error) {
        console.error('Error parsing CSV:', error);
        toast({
          title: "เกิดข้อผิดพลาด",
          description: error instanceof Error ? error.message : "ไม่สามารถอ่านไฟล์ CSV ได้",
          variant: "destructive",
        });
      }
    };

    reader.readAsText(file);
    // Reset file input
    e.target.value = '';
  };

  const confirmImport = async () => {
    const validRows = previewRows.filter(r => r.isValid);
    
    if (validRows.length === 0) {
      toast({
        title: "ไม่มีรายการที่ถูกต้อง",
        description: "กรุณาแก้ไขข้อมูลในไฟล์ CSV แล้วลองใหม่",
        variant: "destructive",
      });
      setShowPreview(false);
      return;
    }

    // Create import history record first
    const { data: historyRecord, error: historyError } = await supabase
      .from('import_history')
      .insert({
        user_id: user!.id,
        file_name: 'CSV Import',
        total_rows: previewRows.length,
        success_count: 0,
        update_count: 0,
        error_count: 0,
        import_type: 'csv',
        status: 'completed',
      })
      .select()
      .single();

    if (historyError) {
      console.error('Error creating import history:', historyError);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถบันทึกประวัติการ import ได้",
        variant: "destructive",
      });
      setShowPreview(false);
      return;
    }

    let successCount = 0;
    let errorCount = 0;
    let updateCount = 0;
    const importItems: any[] = [];

    for (const row of validRows) {
      const expense = row.data;
      
      try {
        // ถ้ามี ID = UPDATE, ถ้าไม่มี ID = INSERT
        if (expense.id) {
          // Fetch original data before update for rollback
          const { data: originalData } = await supabase
            .from('expenses')
            .select('*')
            .eq('id', expense.id)
            .eq('user_id', user!.id)
            .single();

          const { error } = await supabase
            .from('expenses')
            .update({
              expense_date: expense.expense_date,
              amount: parseFloat(expense.amount),
              category: expense.category,
              project: expense.project || null,
              subcategory: expense.subcategory || null,
              merchant: expense.merchant || null,
              description: expense.description || null,
              sender: expense.sender || null,
              receiver: expense.receiver || null,
              transaction_id: expense.transaction_id || null,
            })
            .eq('id', expense.id)
            .eq('user_id', user!.id);

          if (error) throw error;
          
          // Record the update with original data for rollback
          importItems.push({
            import_history_id: historyRecord.id,
            expense_id: expense.id,
            action_type: 'update',
            row_number: row.rowNumber,
            row_data: originalData, // Store original data for rollback
          });
          
          updateCount++;
        } else {
          const { data: newExpense, error } = await supabase
            .from('expenses')
            .insert({
              user_id: user!.id,
              expense_date: expense.expense_date,
              amount: parseFloat(expense.amount),
              category: expense.category,
              project: expense.project || null,
              subcategory: expense.subcategory || null,
              merchant: expense.merchant || null,
              description: expense.description || null,
              sender: expense.sender || null,
              receiver: expense.receiver || null,
              transaction_id: expense.transaction_id || null,
            })
            .select()
            .single();

          if (error) throw error;

          // Record the insert
          importItems.push({
            import_history_id: historyRecord.id,
            expense_id: newExpense.id,
            action_type: 'insert',
            row_number: row.rowNumber,
            row_data: expense, // Store inserted data
          });
          
          successCount++;
        }
      } catch (err) {
        console.error('Error processing row:', err);
        errorCount++;
      }
    }

    // Save all import items
    if (importItems.length > 0) {
      await supabase.from('import_items').insert(importItems);
    }

    // Update import history with final counts
    await supabase
      .from('import_history')
      .update({
        success_count: successCount,
        update_count: updateCount,
        error_count: errorCount,
      })
      .eq('id', historyRecord.id);

    const summary = [];
    if (successCount > 0) summary.push(`สร้างใหม่ ${successCount} รายการ`);
    if (updateCount > 0) summary.push(`อัพเดต ${updateCount} รายการ`);
    if (errorCount > 0) summary.push(`ล้มเหลว ${errorCount} รายการ`);

    toast({
      title: "นำเข้าข้อมูลเสร็จสิ้น",
      description: summary.join(', '),
    });

    setShowPreview(false);
    setTimeout(() => navigate('/'), 1500);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const validFiles = selectedFiles.filter(file => 
      file.type.startsWith('image/') || file.type === 'application/pdf'
    );
    
    if (validFiles.length !== selectedFiles.length) {
      toast({
        title: "คำเตือน",
        description: "รองรับเฉพาะไฟล์รูปภาพและ PDF เท่านั้น",
        variant: "destructive",
      });
    }

    // Limit to 20 files for AI analysis
    if (validFiles.length > 20) {
      toast({
        title: "จำกัดจำนวนไฟล์",
        description: "สามารถอัพโหลดได้สูงสุด 20 ไฟล์ต่อครั้ง (เพื่อให้ AI วิเคราะห์ได้อย่างมีประสิทธิภาพ)",
        variant: "destructive",
      });
      return;
    }

    const newFiles: UploadedFile[] = validFiles.map(file => ({
      file,
      status: 'pending'
    }));

    setFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadAll = async () => {
    if (!user) {
      toast({
        title: "กรุณาเข้าสู่ระบบ",
        description: "คุณต้องเข้าสู่ระบบก่อนอัพโหลด",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    const updatedFiles = [...files];

    for (let i = 0; i < updatedFiles.length; i++) {
      if (updatedFiles[i].status !== 'pending') continue;

      updatedFiles[i].status = 'uploading';
      setFiles([...updatedFiles]);

      try {
        // Upload to storage
        const fileExt = updatedFiles[i].file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}-${i}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(fileName, updatedFiles[i].file);

        if (uploadError) throw uploadError;

        // AI Analysis
        let amount = 0;
        let expenseDate = new Date().toISOString().split('T')[0];
        let description = 'รอกรอกข้อมูล';
        let merchant: string | null = null;
        let sender: string | null = null;
        let receiver: string | null = null;
        let transactionId: string | null = null;

        const fileType = updatedFiles[i].file.type;
        const isPDF = fileType === 'application/pdf';

        try {
          console.log(`[BulkUpload] Analyzing file ${i + 1}/${updatedFiles.length}:`, updatedFiles[i].file.name, `(${isPDF ? 'PDF' : 'Image'})`);
          
          // Call AI analysis using the storage path to avoid large payloads
          console.log('[BulkUpload] Calling AI with storagePath...');

          const { data: aiData, error: aiError } = await supabase.functions.invoke('analyze-receipt', {
            body: { 
              storagePath: fileName,
              isPDF 
            }
          });

          console.log('[BulkUpload] AI Response:', { aiData, aiError });

          if (aiError) {
            console.error('[BulkUpload] AI Error:', aiError);
          }

          if (aiData?.success && aiData.data) {
            console.log('[BulkUpload] Extracted data:', aiData.data);
            
            // Check for duplicate transaction if AI extracted transaction_id
            if (aiData.data.transaction_id) {
              const { data: existingExpense } = await supabase
                .from('expenses')
                .select('id')
                .eq('user_id', user.id)
                .eq('transaction_id', aiData.data.transaction_id)
                .maybeSingle();

              if (existingExpense) {
                console.log('[BulkUpload] Duplicate transaction detected:', aiData.data.transaction_id);
                updatedFiles[i].status = 'error';
                updatedFiles[i].error = `สลิปซ้ำ (รหัสอ้างอิง: ${aiData.data.transaction_id})`;
                setFiles([...updatedFiles]);
                continue;
              }
            }

            amount = aiData.data.amount || 0;
            expenseDate = aiData.data.date || expenseDate;
            description = aiData.data.description || 'รอกรอกข้อมูล';
            merchant = aiData.data.merchant || null;
            sender = aiData.data.sender || null;
            receiver = aiData.data.receiver || null;
            transactionId = aiData.data.transaction_id || null;
          } else {
            console.log('[BulkUpload] No valid data from AI, using defaults');
          }
        } catch (aiError) {
          console.error('[BulkUpload] AI analysis exception:', aiError);
          // Continue with default values if AI fails
        }

        console.log('[BulkUpload] Creating expense record:', {
          amount,
          expense_date: expenseDate,
          category: 'ไม่ระบุ',
          description
        });

        // Create expense record
        const { data, error: insertError } = await supabase
          .from('expenses')
          .insert({
            user_id: user.id,
            amount,
            expense_date: expenseDate,
            category: 'ไม่ระบุ',
            subcategory: null,
            project: null,
            description,
            merchant,
            sender,
            receiver,
            receipt_url: fileName,
            transaction_id: transactionId,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        console.log('[BulkUpload] Expense created successfully:', data.id);
        updatedFiles[i].status = 'success';
        updatedFiles[i].id = data.id;
      } catch (error) {
        console.error('Error uploading file:', error);
        updatedFiles[i].status = 'error';
        updatedFiles[i].error = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด';
      }

      setFiles([...updatedFiles]);
    }

    setUploading(false);

    const successCount = updatedFiles.filter(f => f.status === 'success').length;
    const errorCount = updatedFiles.filter(f => f.status === 'error').length;

    toast({
      title: "อัพโหลดเสร็จสิ้น",
      description: `สำเร็จ ${successCount} ไฟล์${errorCount > 0 ? `, ล้มเหลว ${errorCount} ไฟล์` : ''}`,
    });
  };

  const getStatusIcon = (status: UploadedFile['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case 'uploading':
        return <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">อัพโหลดหลายรายการ</h1>
            <p className="text-muted-foreground">อัพโหลดใบเสร็จหลายใบ หรือนำเข้าข้อมูลจาก CSV</p>
          </div>
        </div>

        {/* CSV Upload Section */}
        <Card className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-green-200 dark:border-green-800">
          <div className="flex items-start gap-4">
            <FileSpreadsheet className="h-8 w-8 text-green-600 dark:text-green-400 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold mb-2 text-green-900 dark:text-green-100">
                นำเข้าข้อมูลจาก CSV
              </h3>
              <p className="text-sm text-green-800 dark:text-green-200 mb-4">
                ดาวน์โหลดเทมเพลต กรอกข้อมูล แล้วอัพโหลดกลับมาเพื่อนำเข้าข้อมูลจำนวนมาก
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={downloadCSVTemplate}
                  variant="outline"
                  className="bg-white dark:bg-gray-900"
                >
                  <Download className="h-4 w-4 mr-2" />
                  ดาวน์โหลดเทมเพลต
                </Button>
                <Button
                  onClick={exportCurrentData}
                  variant="outline"
                  className="bg-white dark:bg-gray-900"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export ข้อมูลที่มีอยู่
                </Button>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCSVUpload}
                  className="hidden"
                  id="csv-upload"
                />
                <Button asChild className="bg-green-600 hover:bg-green-700">
                  <label htmlFor="csv-upload" className="cursor-pointer">
                    <Upload className="h-4 w-4 mr-2" />
                    อัพโหลด CSV
                  </label>
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
                รองรับไฟล์ JPG, PNG, WEBP และ PDF (สูงสุด 20 ไฟล์ต่อครั้ง)
              </p>
              <input
                type="file"
                multiple
                accept="image/*,application/pdf"
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
                disabled={uploading}
              />
              <Button asChild disabled={uploading}>
                <label htmlFor="file-upload" className="cursor-pointer">
                  เลือกไฟล์
                </label>
              </Button>
            </div>
          </Card>
        </div>

        {/* File List */}
        {files.length > 0 && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                ไฟล์ที่เลือก ({files.length} ไฟล์)
              </h3>
              <Button
                onClick={uploadAll}
                disabled={uploading || files.every(f => f.status !== 'pending')}
              >
                {uploading ? 'กำลังอัพโหลด...' : 'อัพโหลดทั้งหมด'}
              </Button>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {files.map((fileObj, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex-shrink-0">
                    {getStatusIcon(fileObj.status)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {fileObj.file.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(fileObj.file.size / 1024).toFixed(1)} KB
                    </p>
                    {fileObj.status === 'error' && fileObj.error && (
                      <p className="text-xs text-red-600 mt-1">{fileObj.error}</p>
                    )}
                  </div>

                  {fileObj.status === 'pending' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFile(index)}
                      className="flex-shrink-0"
                    >
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
                <li>• วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD (เช่น 2025-01-15)</li>
                <li>• <strong className="text-red-600 dark:text-red-400">⚠️ ห้ามลบหรือแก้ไขคอลัมน์ ID</strong> (ถ้ามี ID จะ Update, ไม่มีจะ Insert)</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-sm text-blue-900 dark:text-blue-100 mb-1">สำหรับใบเสร็จ:</p>
              <ul className="space-y-1 text-sm text-blue-800 dark:text-blue-200">
                <li>• อัพโหลดใบเสร็จได้สูงสุด 20 ไฟล์ต่อครั้ง</li>
                <li>• AI จะวิเคราะห์จำนวนเงิน, วันที่, และรายละเอียดโดยอัตโนมัติ</li>
                <li>• ประเภทและโปรเจคจะถูกตั้งเป็น "ไม่ระบุ" ให้กรอกเองในภายหลัง</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* Import History Section */}
        <ImportHistory />

        {/* CSV Preview Dialog */}
        <CSVPreviewDialog
          open={showPreview}
          onOpenChange={setShowPreview}
          rows={previewRows}
          onConfirm={confirmImport}
          onCancel={() => setShowPreview(false)}
        />
      </div>
    </div>
  );
}
