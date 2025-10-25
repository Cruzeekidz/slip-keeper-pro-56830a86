import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, X, Receipt, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface ExpenseUploadProps {
  onClose: () => void;
}

export function ExpenseUpload({ onClose }: ExpenseUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [extractedData, setExtractedData] = useState<{
    amount: number | null;
    date: string | null;
    description: string | null;
    merchant: string | null;
    transaction_id: string | null;
  } | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [categories, setCategories] = useState<string[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [hiddenProjects, setHiddenProjects] = useState<string[]>([]);
  const [isManagingProjects, setIsManagingProjects] = useState(false);
  const { toast } = useToast();

  // Load hidden projects from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('hiddenProjects');
    if (stored) {
      setHiddenProjects(JSON.parse(stored));
    }
  }, []);

  // Fetch distinct categories and projects
  useEffect(() => {
    const fetchSuggestions = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch distinct categories
      const { data: categoryData } = await supabase
        .from('expenses')
        .select('category')
        .eq('user_id', user.id)
        .order('category');
      
      if (categoryData) {
        // Use Set to ensure uniqueness and filter out empty values
        const uniqueCategories = [...new Set(categoryData.map(item => item.category).filter(Boolean))];
        setCategories(uniqueCategories);
      }

      // Fetch distinct projects
      const { data: projectData } = await supabase
        .from('expenses')
        .select('project')
        .eq('user_id', user.id)
        .not('project', 'is', null);
      
      if (projectData) {
        const uniqueProjects = [...new Set(projectData.map(item => item.project).filter(Boolean))] as string[];
        setProjects(uniqueProjects);
      }
    };

    fetchSuggestions();
  }, []);

  const handleHideProject = (project: string) => {
    const updated = [...hiddenProjects, project];
    setHiddenProjects(updated);
    localStorage.setItem('hiddenProjects', JSON.stringify(updated));
    toast({
      title: "ซ่อนโปรเจคแล้ว",
      description: `ซ่อน "${project}" จากรายการแนะนำ`,
    });
  };

  const handleUnhideProject = (project: string) => {
    const updated = hiddenProjects.filter(p => p !== project);
    setHiddenProjects(updated);
    localStorage.setItem('hiddenProjects', JSON.stringify(updated));
    toast({
      title: "แสดงโปรเจคอีกครั้ง",
      description: `แสดง "${project}" ในรายการแนะนำอีกครั้ง`,
    });
  };

  const visibleProjects = projects.filter(p => !hiddenProjects.includes(p));

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles(prev => [...prev, ...droppedFiles]);
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...newFiles]);
      
      // Auto-analyze the first file if it's an image
      if (newFiles.length > 0 && newFiles[0].type.startsWith('image/')) {
        await analyzeReceipt(newFiles[0]);
      }
    }
  };

  const analyzeReceipt = async (file: File) => {
    setIsAnalyzing(true);
    try {
      // Convert file to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      const imageBase64 = await base64Promise;

      // Call edge function to analyze
      const { data, error } = await supabase.functions.invoke('analyze-receipt', {
        body: { fileBase64: imageBase64, isPDF: false }
      });

      if (error) {
        console.error('Analysis error:', error);
        toast({
          title: "ไม่สามารถวิเคราะห์สลิปได้",
          description: "กรุณากรอกข้อมูลด้วยตนเอง",
          variant: "destructive",
        });
        setStep(2);
        return;
      }

      if (data?.success && data?.data) {
        setExtractedData(data.data);
        setStep(2);
        toast({
          title: "วิเคราะห์สลิปสำเร็จ",
          description: "กรุณาตรวจสอบและแก้ไขข้อมูลก่อนบันทึก",
        });
      } else {
        throw new Error("No data extracted");
      }
    } catch (error) {
      console.error('Error analyzing receipt:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถวิเคราะห์สลิปได้ กรุณากรอกข้อมูลด้วยตนเอง",
        variant: "destructive",
      });
      setStep(2);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const formData = new FormData(e.currentTarget);
    const amount = formData.get("amount") as string;
    const category = formData.get("category") as string;
    const project = formData.get("project") as string;
    const date = formData.get("date") as string;
    const description = formData.get("description") as string;

    if (!amount || !category || !date) {
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "กรุณากรอกข้อมูลที่จำเป็น",
        variant: "destructive",
      });
      return;
    }

    try {
      let receiptUrl = null;

      // Upload receipt files if any
      if (files.length > 0) {
        const file = files[0]; // Use first file
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const userId = (await supabase.auth.getUser()).data.user?.id;
        
        if (!userId) {
          toast({
            title: "เกิดข้อผิดพลาด",
            description: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง",
            variant: "destructive",
          });
          return;
        }
        
        const filePath = `${userId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(filePath, file);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          toast({
            title: "เกิดข้อผิดพลาด",
            description: "ไม่สามารถอัพโหลดไฟล์ได้",
            variant: "destructive",
          });
          return;
        }

      receiptUrl = filePath;
      }

      // Check for duplicate transaction_id if AI extracted one
      if (extractedData?.transaction_id) {
        const userId = (await supabase.auth.getUser()).data.user?.id;
        const { data: existing } = await supabase
          .from('expenses')
          .select('id')
          .eq('user_id', userId)
          .eq('transaction_id', extractedData.transaction_id)
          .maybeSingle();

        if (existing) {
          toast({
            title: "พบรายการซ้ำ",
            description: `สลิปนี้เคยอัพโหลดแล้ว (รหัสอ้างอิง: ${extractedData.transaction_id})`,
            variant: "destructive",
          });
          return;
        }
      }

      // Insert expense data
      const { error } = await supabase
        .from('expenses')
        .insert({
          amount: parseFloat(amount),
          category,
          project: project || null,
          description: description || null,
          expense_date: date,
          receipt_url: receiptUrl,
          transaction_id: extractedData?.transaction_id || null,
          merchant: extractedData?.merchant || null,
          user_id: (await supabase.auth.getUser()).data.user?.id
        });

      if (error) {
        console.error('Insert error:', error);
        toast({
          title: "เกิดข้อผิดพลาด",
          description: "ไม่สามารถบันทึกข้อมูลได้",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "บันทึกสำเร็จ",
        description: "บันทึกรายการค่าใช้จ่ายเรียบร้อยแล้ว",
      });
      
      onClose();
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "กรุณาลองใหม่อีกครั้ง",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="p-6 bg-gradient-card shadow-elevated">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-foreground">
          {step === 1 ? "ขั้นตอนที่ 1: อัพโหลดสลิป" : "ขั้นตอนที่ 2: ตรวจสอบและแก้ไขข้อมูล"}
        </h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {step === 1 ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>อัพโหลดสลิปเงินโอน</Label>
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive ? "border-primary bg-primary/5" : "border-border"
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <Upload className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground mb-2">
                {isAnalyzing ? "กำลังวิเคราะห์สลิป..." : "ลากไฟล์มาวางหรือคลิกเพื่อเลือกไฟล์"}
              </p>
              <div className="relative inline-block">
                <Button type="button" variant="outline" size="sm" disabled={isAnalyzing}>
                  {isAnalyzing ? "กำลังวิเคราะห์..." : "เลือกไฟล์"}
                </Button>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileInput}
                  disabled={isAnalyzing}
                  aria-label="เลือกไฟล์สลิป"
                  className="absolute inset-0 h-full w-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
              </div>
            </div>
            
            {files.length > 0 && (
              <div className="space-y-2">
                {files.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                    <div className="flex items-center gap-2">
                      <Receipt className="h-4 w-4" />
                      <span className="text-sm">{file.name}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(index)}
                      disabled={isAnalyzing}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              className="flex-1"
              onClick={() => setStep(2)}
              disabled={isAnalyzing}
            >
              ข้ามไปกรอกข้อมูลเอง
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              ยกเลิก
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {extractedData && (
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg mb-4">
              <p className="text-sm text-muted-foreground mb-2">
                ข้อมูลที่วิเคราะห์จากสลิป (สามารถแก้ไขได้):
              </p>
              <ul className="text-sm space-y-1">
                {extractedData.amount && <li>• จำนวนเงิน: {extractedData.amount} บาท</li>}
                {extractedData.date && <li>• วันที่: {extractedData.date}</li>}
                {extractedData.merchant && <li>• ผู้รับ/ร้านค้า: {extractedData.merchant}</li>}
                {extractedData.description && <li>• รายละเอียด: {extractedData.description}</li>}
              </ul>
            </div>
          )}

          {files.length > 0 && (
            <div className="space-y-2 mb-4">
              <Label>ไฟล์ที่อัพโหลด</Label>
              {files.map((file, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4" />
                    <span className="text-sm">{file.name}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(index)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="amount">จำนวนเงิน (บาท)</Label>
            <Input 
              id="amount" 
              name="amount" 
              type="number" 
              step="0.01" 
              placeholder="0.00" 
              defaultValue={extractedData?.amount || undefined}
              required 
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="category">ประเภท</Label>
            <Input
              id="category"
              name="category"
              type="text"
              placeholder="ระบุประเภทค่าใช้จ่าย"
              list="category-suggestions"
              required
            />
            <datalist id="category-suggestions">
              <option value="ค่าใช้จ่ายส่วนตัว" />
              <option value="ค่าใช้จ่ายบริษัท" />
              {categories.map(cat => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="project">โปรเจ็ค/ร้าน</Label>
              {projects.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsManagingProjects(!isManagingProjects)}
                  className="text-xs"
                >
                  จัดการรายการ
                </Button>
              )}
            </div>
            <Input
              id="project"
              name="project"
              type="text"
              placeholder="ระบุชื่อโปรเจ็คหรือร้าน"
              list="project-suggestions"
            />
            <datalist id="project-suggestions">
              {visibleProjects.map(proj => (
                <option key={proj} value={proj} />
              ))}
            </datalist>
            
            {isManagingProjects && projects.length > 0 && (
              <div className="mt-2 p-3 bg-muted rounded-lg space-y-2">
                <p className="text-xs text-muted-foreground mb-2">คลิก X เพื่อซ่อนโปรเจคจากรายการแนะนำ</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {projects.map(proj => (
                    <div key={proj} className="flex items-center justify-between p-2 bg-background rounded text-sm">
                      <span className={hiddenProjects.includes(proj) ? "line-through text-muted-foreground" : ""}>
                        {proj}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => hiddenProjects.includes(proj) ? handleUnhideProject(proj) : handleHideProject(proj)}
                      >
                        {hiddenProjects.includes(proj) ? (
                          <span className="text-xs">แสดง</span>
                        ) : (
                          <X className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="date">วันที่</Label>
            <Input 
              id="date" 
              name="date" 
              type="date" 
              defaultValue={extractedData?.date || new Date().toISOString().split('T')[0]} 
              required 
            />
          </div>
        </div>

          <div className="space-y-2">
            <Label htmlFor="description">รายละเอียด</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="รายละเอียดค่าใช้จ่าย..."
              rows={3}
              defaultValue={
                extractedData?.description || 
                (extractedData?.merchant ? `ชำระเงินให้ ${extractedData.merchant}` : '')
              }
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                setStep(1);
                setExtractedData(null);
              }}
            >
              ย้อนกลับ
            </Button>
            <Button type="submit" className="flex-1 bg-gradient-primary">
              บันทึกรายการ
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              ยกเลิก
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}