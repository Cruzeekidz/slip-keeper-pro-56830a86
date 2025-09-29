import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Upload, X, Receipt } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ExpenseUploadProps {
  onClose: () => void;
}

export function ExpenseUpload({ onClose }: ExpenseUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const { toast } = useToast();

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

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (files.length === 0) {
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "กรุณาอัพโหลดใบเสร็จหรือสลิป",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "บันทึกสำเร็จ",
      description: "บันทึกรายการค่าใช้จ่ายเรียบร้อยแล้ว",
    });
    
    onClose();
  };

  return (
    <Card className="p-6 bg-gradient-card shadow-elevated">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-foreground">เพิ่มรายการใหม่</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* File Upload Area */}
        <div className="space-y-2">
          <Label>อัพโหลดใบเสร็จ/สลิป</Label>
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
            <p className="text-muted-foreground mb-2">ลากไฟล์มาวางหรือคลิกเพื่อเลือกไฟล์</p>
            <Input
              type="file"
              multiple
              accept="image/*,.pdf"
              onChange={handleFileInput}
              className="hidden"
              id="file-upload"
            />
            <Label htmlFor="file-upload" className="cursor-pointer">
              <Button type="button" variant="outline" size="sm">
                เลือกไฟล์
              </Button>
            </Label>
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
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="amount">จำนวนเงิน (บาท)</Label>
            <Input id="amount" type="number" placeholder="0.00" required />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="category">ประเภท</Label>
            <Select required>
              <SelectTrigger>
                <SelectValue placeholder="เลือกประเภท" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">ค่าใช้จ่ายส่วนตัว</SelectItem>
                <SelectItem value="company">ค่าใช้จ่ายบริษัท</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="project">โปรเจ็ค/ร้าน</Label>
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="เลือกโปรเจ็ค" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="booth">บูธขายของ</SelectItem>
                <SelectItem value="online">ขายออนไลน์</SelectItem>
                <SelectItem value="event">ขายตั๋วกิจกรรม</SelectItem>
                <SelectItem value="other">อื่นๆ</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="date">วันที่</Label>
            <Input id="date" type="date" required />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">รายละเอียด</Label>
          <Textarea
            id="description"
            placeholder="รายละเอียดค่าใช้จ่าย..."
            rows={3}
          />
        </div>

        <div className="flex gap-3 pt-4">
          <Button type="submit" className="flex-1 bg-gradient-primary">
            บันทึกรายการ
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            ยกเลิก
          </Button>
        </div>
      </form>
    </Card>
  );
}