import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Camera, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import browserImageCompression from "browser-image-compression";

export interface ExpenseClaimItem {
  id: string;
  category: string;
  description: string;
  amount: number;
  receipt_url: string;
  has_formal_receipt: boolean;
  expense_date: string;
}

const CATEGORIES = [
  "ค่าเดินทาง",
  "ค่าทางด่วน",
  "ค่าน้ำมัน",
  "ค่าอุปกรณ์/เครื่องเขียน",
  "ค่าอาหาร",
  "ค่าที่พัก",
  "ค่าวัสดุ",
  "อื่นๆ",
];

interface Props {
  items: ExpenseClaimItem[];
  onChange: (items: ExpenseClaimItem[]) => void;
  staffId: string;
}

const ExpenseClaimSection = ({ items, onChange, staffId }: Props) => {
  const [uploading, setUploading] = useState<string | null>(null);

  const addItem = () => {
    onChange([
      ...items,
      {
        id: crypto.randomUUID(),
        category: "อื่นๆ",
        description: "",
        amount: 0,
        receipt_url: "",
        has_formal_receipt: false,
        expense_date: new Date().toISOString().split("T")[0],
      },
    ]);
  };

  const removeItem = (id: string) => {
    onChange(items.filter((i) => i.id !== id));
  };

  const updateItem = (id: string, field: keyof ExpenseClaimItem, value: any) => {
    onChange(items.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  };

  const handleReceiptUpload = async (id: string, file: File) => {
    setUploading(id);
    try {
      const compressed = await browserImageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        initialQuality: 0.8,
      });
      const ext = file.name.split(".").pop() || "jpg";
      const path = `expense-claims/${staffId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("receipts").upload(path, compressed);
      if (error) throw error;

      const { data: urlData } = await supabase.storage.from("receipts").createSignedUrl(path, 86400 * 365);
      if (urlData?.signedUrl) {
        updateItem(id, "receipt_url", path);
        updateItem(id, "has_formal_receipt", true);
      }
    } catch (err) {
      console.error("Upload error:", err);
    }
    setUploading(null);
  };

  const totalAmount = items.reduce((sum, i) => sum + i.amount, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold flex items-center gap-2">
          <Receipt className="h-4 w-4" />
          ค่าใช้จ่ายอื่น (เบิกเพิ่มเติม)
        </Label>
        <Button type="button" variant="outline" size="sm" onClick={addItem}>
          <Plus className="h-3 w-3 mr-1" /> เพิ่มรายการ
        </Button>
      </div>

      {items.map((item, idx) => (
        <Card key={item.id} className="relative">
          <CardContent className="pt-4 pb-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">รายการที่ {idx + 1}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(item.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">ประเภท</Label>
                <Select value={item.category} onValueChange={(v) => updateItem(item.id, "category", v)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">วันที่</Label>
                <Input
                  type="date"
                  className="h-9 text-sm"
                  value={item.expense_date}
                  onChange={(e) => updateItem(item.id, "expense_date", e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">รายละเอียด *</Label>
              <Input
                className="h-9 text-sm"
                value={item.description}
                onChange={(e) => updateItem(item.id, "description", e.target.value)}
                placeholder="เช่น ค่าทางด่วน กรุงเทพ-ชลบุรี"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">จำนวนเงิน (บาท) *</Label>
                <Input
                  type="number"
                  className="h-9 text-sm"
                  value={item.amount || ""}
                  onChange={(e) => updateItem(item.id, "amount", Number(e.target.value))}
                  required
                />
              </div>
              <div>
                <Label className="text-xs">ใบเสร็จ</Label>
                <div className="relative">
                  <Input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="h-9 text-sm"
                    disabled={uploading === item.id}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleReceiptUpload(item.id, f);
                    }}
                  />
                  {item.receipt_url && (
                    <Camera className="absolute right-2 top-2 h-4 w-4 text-green-500" />
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {items.length > 0 && (
        <div className="flex justify-end text-sm font-semibold">
          รวมค่าใช้จ่ายอื่น: {totalAmount.toLocaleString()} บาท
        </div>
      )}
    </div>
  );
};

export default ExpenseClaimSection;
