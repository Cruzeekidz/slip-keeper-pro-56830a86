import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Upload, X, Receipt, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import imageCompression from 'browser-image-compression';
import {
  TransactionType, CategoryGroup, TransactionDirection,
  TRANSACTION_TYPES, CATEGORY_GROUPS, TRANSACTION_DIRECTIONS,
  getSubcategoriesForType, getDefaultProjectTags, showProjectTag as shouldShowProjectTag,
} from "@/lib/category-constants";

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
    sender: string | null;
    receiver: string | null;
    transaction_id: string | null;
    category: string | null;
    project: string | null;
    subcategory: string | null;
    transaction_type: string | null;
    category_group: string | null;
    project_tag: string | null;
    confidence_score: number | null;
  } | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [existingTags, setExistingTags] = useState<string[]>([]);
  const [existingSubcategories, setExistingSubcategories] = useState<string[]>([]);
  const [payeeGroupNames, setPayeeGroupNames] = useState<string[]>([]);
  const [transactionType, setTransactionType] = useState<TransactionType | "">("");
  const [categoryGroup, setCategoryGroup] = useState<CategoryGroup | "">("");
  const [projectTag, setProjectTag] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [transactionDirection, setTransactionDirection] = useState<TransactionDirection>("EXPENSE");
  const [payeeGroup, setPayeeGroup] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
      const [tagRes, subcatRes, pgRes] = await Promise.all([
        supabase.from('expenses').select('project_tag').not('project_tag', 'is', null),
        supabase.from('expenses').select('subcategory').not('subcategory', 'is', null),
        supabase.from('payee_groups').select('group_name'),
      ]);
      if (tagRes.data) setExistingTags([...new Set(tagRes.data.map(i => i.project_tag).filter(Boolean))] as string[]);
      if (subcatRes.data) setExistingSubcategories([...new Set(subcatRes.data.map(i => i.subcategory).filter(Boolean))] as string[]);
      if (pgRes.data) setPayeeGroupNames([...new Set(pgRes.data.map(i => i.group_name).filter(Boolean))] as string[]);
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (extractedData) {
      if (extractedData.transaction_type) setTransactionType(extractedData.transaction_type as TransactionType);
      if (extractedData.category_group) setCategoryGroup(extractedData.category_group as CategoryGroup);
      if (extractedData.project_tag) setProjectTag(extractedData.project_tag);
      if (extractedData.subcategory) setSubcategory(extractedData.subcategory);
    }
  }, [extractedData]);

  const defaultSubcats = getSubcategoriesForType(transactionType || null, categoryGroup || null, transactionDirection);
  const allSubcategories = [...new Set([...defaultSubcats, ...existingSubcategories])];
  const projectTags = [
    ...getDefaultProjectTags(categoryGroup as CategoryGroup || null),
    ...existingTags.filter(t => !getDefaultProjectTags(categoryGroup as CategoryGroup || null).includes(t)),
  ];
  const showGroup = transactionType === 'BUSINESS';
  const showTag = showGroup && shouldShowProjectTag(categoryGroup as CategoryGroup || null);
  const showDirection = transactionType === 'BUSINESS' && categoryGroup === 'EVENT';

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...newFiles]);
      if (newFiles.length > 0) {
        const file = newFiles[0];
        if (file.type.startsWith('image/') || file.type === 'application/pdf') {
          await analyzeReceipt(file);
        }
      }
    }
  };

  const analyzeReceipt = async (file: File) => {
    setIsAnalyzing(true);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const imageBase64 = await base64Promise;
      const { data, error } = await supabase.functions.invoke('analyze-receipt', {
        body: { fileBase64: imageBase64, isPDF: false }
      });
      if (error) { toast({ title: "ไม่สามารถวิเคราะห์สลิปได้", variant: "destructive" }); setStep(2); return; }
      if (data?.success && data?.data) {
        setExtractedData(data.data);
        setStep(2);
        toast({ title: "วิเคราะห์สลิปสำเร็จ", description: "กรุณาตรวจสอบข้อมูล" });
      } else { throw new Error("No data"); }
    } catch (error) {
      console.error('Error analyzing receipt:', error);
      toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
      setStep(2);
    } finally { setIsAnalyzing(false); }
  };

  const removeFile = (index: number) => setFiles(prev => prev.filter((_, i) => i !== index));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const amount = formData.get("amount") as string;
    const date = formData.get("date") as string;
    const description = formData.get("description") as string;

    if (!amount || !transactionType || !date) {
      toast({ title: "กรุณากรอกข้อมูลที่จำเป็น", variant: "destructive" });
      return;
    }

    try {
      let receiptUrl = null;
      if (files.length > 0) {
        let file = files[0];
        if (file.type.startsWith('image/')) {
          try { file = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true, initialQuality: 0.8 }); } catch { file = files[0]; }
        }
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const userId = (await supabase.auth.getUser()).data.user?.id;
        if (!userId) { toast({ title: "กรุณาเข้าสู่ระบบใหม่", variant: "destructive" }); return; }
        const filePath = `${userId}/${fileName}`;
        const { error: uploadError } = await supabase.storage.from('receipts').upload(filePath, file);
        if (uploadError) { toast({ title: "ไม่สามารถอัพโหลดไฟล์ได้", variant: "destructive" }); return; }
        receiptUrl = filePath;
      }

      if (extractedData?.transaction_id) {
        const userId = (await supabase.auth.getUser()).data.user?.id;
        const { data: existing } = await supabase.from('expenses').select('id').eq('user_id', userId).eq('transaction_id', extractedData.transaction_id).maybeSingle();
        if (existing) { toast({ title: "พบรายการซ้ำ", variant: "destructive" }); return; }
      }

      const isLowConfidence = extractedData?.confidence_score != null && extractedData.confidence_score < 75;

      const { error } = await supabase.from('expenses').insert({
        amount: parseFloat(amount),
        category: transactionType === 'BUSINESS' && categoryGroup ? `${transactionType}/${categoryGroup}` : transactionType,
        subcategory: subcategory || null,
        project: formData.get("project") as string || null,
        description: description || null,
        expense_date: date,
        receipt_url: receiptUrl,
        transaction_id: extractedData?.transaction_id || null,
        merchant: extractedData?.merchant || null,
        sender: extractedData?.sender || null,
        receiver: extractedData?.receiver || null,
        user_id: (await supabase.auth.getUser()).data.user?.id,
        transaction_type: transactionType,
        category_group: categoryGroup || null,
        project_tag: projectTag || null,
        confidence_score: extractedData?.confidence_score || null,
        needs_review: isLowConfidence,
        transaction_direction: transactionDirection,
        payee_group: payeeGroup || null,
      });

      if (error) { toast({ title: "ไม่สามารถบันทึกข้อมูลได้", variant: "destructive" }); return; }

      // Save payee group
      if (payeeGroup && (extractedData?.merchant || extractedData?.receiver)) {
        const payee = extractedData?.merchant || extractedData?.receiver || '';
        const userId = (await supabase.auth.getUser()).data.user?.id;
        if (userId && payee) {
          await supabase.from('payee_groups').upsert({
            user_id: userId, payee_pattern: payee, group_name: payeeGroup,
          }, { onConflict: 'user_id,payee_pattern' });
        }
      }

      toast({
        title: "บันทึกสำเร็จ",
        description: isLowConfidence ? "⚠️ ควรตรวจสอบการจัดหมวดหมู่" : "บันทึกรายการเรียบร้อย",
      });
      onClose();
    } catch (error) {
      console.error('Error:', error);
      toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
    }
  };

  return (
    <Card className="p-6 bg-gradient-card shadow-elevated">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-foreground">
          {step === 1 ? "ขั้นตอนที่ 1: อัพโหลดสลิป" : "ขั้นตอนที่ 2: ตรวจสอบข้อมูล"}
        </h2>
        <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      {step === 1 ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>อัพโหลดสลิปเงินโอน</Label>
            <div className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragActive ? "border-primary bg-primary/5" : "border-border"}`}
              onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}>
              <Upload className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground mb-2">{isAnalyzing ? "กำลังวิเคราะห์สลิป..." : "ลากไฟล์มาวางหรือคลิกเพื่อเลือก"}</p>
              <div className="relative inline-block">
                <Button type="button" variant="outline" size="sm" disabled={isAnalyzing}>
                  {isAnalyzing ? "กำลังวิเคราะห์..." : "เลือกไฟล์"}
                </Button>
                <input type="file" accept="image/*,.pdf" onChange={handleFileInput} disabled={isAnalyzing}
                  className="absolute inset-0 h-full w-full opacity-0 cursor-pointer disabled:cursor-not-allowed" />
              </div>
            </div>
            {files.length > 0 && (
              <div className="space-y-2">
                {files.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                    <div className="flex items-center gap-2"><Receipt className="h-4 w-4" /><span className="text-sm">{file.name}</span></div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeFile(index)} disabled={isAnalyzing}><X className="h-3 w-3" /></Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(2)} disabled={isAnalyzing}>ข้ามไปกรอกข้อมูลเอง</Button>
            <Button type="button" variant="outline" onClick={onClose}>ยกเลิก</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {extractedData && (
            <div className={`p-4 border rounded-lg mb-4 ${extractedData.confidence_score != null && extractedData.confidence_score < 75 ? 'bg-warning/5 border-warning/20' : 'bg-primary/5 border-primary/20'}`}>
              <p className="text-sm text-muted-foreground mb-2">
                ข้อมูลที่วิเคราะห์จากสลิป
                {extractedData.confidence_score != null && (
                  <span className={`ml-2 font-medium ${extractedData.confidence_score >= 75 ? 'text-success' : 'text-warning'}`}>
                    (ความมั่นใจ: {extractedData.confidence_score}%)
                  </span>
                )}
              </p>
              <ul className="text-sm space-y-1">
                {extractedData.amount && <li>• จำนวนเงิน: {extractedData.amount} บาท</li>}
                {extractedData.date && <li>• วันที่: {extractedData.date}</li>}
                {extractedData.transaction_type && <li>• ประเภท: {extractedData.transaction_type}</li>}
                {extractedData.category_group && <li>• กลุ่ม: {extractedData.category_group}</li>}
                {extractedData.project_tag && <li>• แท็ก: {extractedData.project_tag}</li>}
                {extractedData.subcategory && <li>• ประเภทย่อย: {extractedData.subcategory}</li>}
              </ul>
            </div>
          )}

          {files.length > 0 && (
            <div className="space-y-2 mb-4">
              <Label>ไฟล์ที่อัพโหลด</Label>
              {files.map((file, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                  <div className="flex items-center gap-2"><Receipt className="h-4 w-4" /><span className="text-sm">{file.name}</span></div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeFile(index)}><X className="h-3 w-3" /></Button>
                </div>
              ))}
            </div>
          )}

          {/* Category System */}
          <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
            <h3 className="font-semibold text-sm text-foreground">การจัดหมวดหมู่</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>ประเภทธุรกรรม *</Label>
                <Select value={transactionType} onValueChange={(v) => { setTransactionType(v as TransactionType); setCategoryGroup(""); setSubcategory(""); setProjectTag(""); setTransactionDirection("EXPENSE"); }}>
                  <SelectTrigger><SelectValue placeholder="เลือกประเภท" /></SelectTrigger>
                  <SelectContent>
                    {TRANSACTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {showGroup && (
                <div className="space-y-2">
                  <Label>กลุ่ม</Label>
                  <Select value={categoryGroup} onValueChange={(v) => { setCategoryGroup(v as CategoryGroup); setSubcategory(""); setProjectTag(""); }}>
                    <SelectTrigger><SelectValue placeholder="เลือกกลุ่ม" /></SelectTrigger>
                    <SelectContent>
                      {CATEGORY_GROUPS.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {showDirection && (
                <div className="space-y-2">
                  <Label>ทิศทาง</Label>
                  <Select value={transactionDirection} onValueChange={(v) => { setTransactionDirection(v as TransactionDirection); setSubcategory(""); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TRANSACTION_DIRECTIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {showTag && (
                <div className="space-y-2">
                  <Label>แท็กโปรเจค</Label>
                  <Combobox
                    options={projectTags}
                    value={projectTag}
                    onValueChange={setProjectTag}
                    placeholder="เลือกหรือพิมพ์แท็ก"
                  />
                </div>
              )}

              {defaultSubcats.length > 0 && (
                <div className="space-y-2">
                  <Label>ประเภทย่อย</Label>
                  <Combobox
                    options={allSubcategories}
                    value={subcategory}
                    onValueChange={setSubcategory}
                    placeholder="เลือกหรือพิมพ์ประเภทย่อย"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">จำนวนเงิน (บาท) *</Label>
              <Input id="amount" name="amount" type="number" step="0.01" placeholder="0.00"
                defaultValue={extractedData?.amount || undefined} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">วันที่ *</Label>
              <Input id="date" name="date" type="date"
                defaultValue={extractedData?.date || new Date().toISOString().split('T')[0]} required />
            </div>
          </div>

          {/* Payee Group */}
          <div className="space-y-2">
            <Label>กลุ่มผู้รับเงิน (Payee Group)</Label>
            <Combobox
              options={payeeGroupNames}
              value={payeeGroup}
              onValueChange={setPayeeGroup}
              placeholder="เช่น บัตรเครดิต, Marketing Agency"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project">โปรเจ็ค/ร้าน</Label>
            <Input id="project" name="project" type="text" placeholder="ระบุชื่อโปรเจ็คหรือร้าน"
              defaultValue={extractedData?.project || undefined} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">รายละเอียด</Label>
            <Textarea id="description" name="description" placeholder="รายละเอียดค่าใช้จ่าย..." rows={3}
              defaultValue={extractedData?.description || (extractedData?.merchant ? `ชำระเงินให้ ${extractedData.merchant}` : '')} />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => { setStep(1); setExtractedData(null); }}>ย้อนกลับ</Button>
            <Button type="submit" className="flex-1 bg-gradient-primary">บันทึกรายการ</Button>
            <Button type="button" variant="outline" onClick={onClose}>ยกเลิก</Button>
          </div>
        </form>
      )}
    </Card>
  );
}
