import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, CheckCircle, AlertCircle, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface UploadedFile {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  id?: string;
}

export default function BulkUpload() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const imageFiles = selectedFiles.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length !== selectedFiles.length) {
      toast({
        title: "คำเตือน",
        description: "รองรับเฉพาะไฟล์รูปภาพเท่านั้น",
        variant: "destructive",
      });
    }

    // Limit to 20 files for AI analysis
    if (imageFiles.length > 20) {
      toast({
        title: "จำกัดจำนวนไฟล์",
        description: "สามารถอัพโหลดได้สูงสุด 20 ไฟล์ต่อครั้ง (เพื่อให้ AI วิเคราะห์ได้อย่างมีประสิทธิภาพ)",
        variant: "destructive",
      });
      return;
    }

    const newFiles: UploadedFile[] = imageFiles.map(file => ({
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

        // AI Analysis (if file is image)
        let amount = 0;
        let expenseDate = new Date().toISOString().split('T')[0];
        let description = 'รอกรอกข้อมูล';

        try {
          console.log(`[BulkUpload] Analyzing file ${i + 1}/${updatedFiles.length}:`, updatedFiles[i].file.name);
          
          // Convert file to base64 with proper data URL format
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve, reject) => {
            reader.onloadend = () => {
              // Keep the full data URL format (data:image/jpeg;base64,xxx)
              const base64 = reader.result as string;
              resolve(base64);
            };
            reader.onerror = reject;
          });
          reader.readAsDataURL(updatedFiles[i].file);
          const imageBase64 = await base64Promise;
          
          console.log('[BulkUpload] Image converted to base64, calling AI...');

          // Call AI analysis
          const { data: aiData, error: aiError } = await supabase.functions.invoke('analyze-receipt', {
            body: { imageBase64 }
          });

          console.log('[BulkUpload] AI Response:', { aiData, aiError });

          if (aiError) {
            console.error('[BulkUpload] AI Error:', aiError);
          }

          if (aiData?.success && aiData.data) {
            console.log('[BulkUpload] Extracted data:', aiData.data);
            amount = aiData.data.amount || 0;
            expenseDate = aiData.data.date || expenseDate;
            description = aiData.data.description || aiData.data.merchant || 'รอกรอกข้อมูล';
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
            project: null,
            description,
            receipt_url: fileName,
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
            <h1 className="text-3xl font-bold text-foreground">อัพโหลดหลายไฟล์</h1>
            <p className="text-muted-foreground">อัพโหลดใบเสร็จหลายใบพร้อมกัน แล้วกลับมาแก้ไขข้อมูลภายหลัง</p>
          </div>
        </div>

        {/* Upload Area */}
        <Card className="p-8">
          <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-12 text-center hover:border-primary/50 transition-colors">
            <Upload className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">เลือกไฟล์รูปภาพ</h3>
            <p className="text-sm text-muted-foreground mb-4">
              รองรับไฟล์ JPG, PNG, WEBP (สูงสุด 20 ไฟล์ต่อครั้ง)
            </p>
            <input
              type="file"
              multiple
              accept="image/*"
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
          <ul className="space-y-1 text-sm text-blue-800 dark:text-blue-200">
            <li>• อัพโหลดใบเสร็จได้สูงสุด 20 ไฟล์ต่อครั้ง</li>
            <li>• AI จะวิเคราะห์จำนวนเงิน, วันที่, และรายละเอียดโดยอัตโนมัติ</li>
            <li>• ประเภทและโปรเจคจะถูกตั้งเป็น "ไม่ระบุ" ให้กรอกเองในภายหลัง</li>
            <li>• กลับไปหน้าแรก แล้วคลิกปุ่ม "แก้ไข" เพื่อเพิ่มประเภทและโปรเจค</li>
            <li>• สามารถกรองรายการ "ประเภท: ไม่ระบุ" เพื่อหารายการที่ยังไม่ได้แก้ไข</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
