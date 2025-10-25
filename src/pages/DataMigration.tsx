import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function DataMigration() {
  const [loading, setLoading] = useState(false);
  const [field, setField] = useState<string>("category");
  const [fromValue, setFromValue] = useState<string>("");
  const [toValue, setToValue] = useState<string>("");
  const navigate = useNavigate();
  const { toast } = useToast();

  const performMigration = async () => {
    if (!fromValue.trim() || !toValue.trim()) {
      toast({
        title: "กรุณากรอกข้อมูล",
        description: "กรุณากรอกค่าเดิมและค่าใหม่",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      let result;
      
      if (field === 'category') {
        result = await supabase
          .from('expenses')
          .update({ category: toValue })
          .eq('category', fromValue)
          .select();
      } else if (field === 'project') {
        result = await supabase
          .from('expenses')
          .update({ project: toValue })
          .eq('project', fromValue)
          .select();
      } else {
        result = await supabase
          .from('expenses')
          .update({ subcategory: toValue })
          .eq('subcategory', fromValue)
          .select();
      }

      const { error, data } = result;

      if (error) throw error;

      toast({
        title: "อัพเดทสำเร็จ",
        description: `แปลง ${field} จาก "${fromValue}" เป็น "${toValue}" จำนวน ${data?.length || 0} รายการ`,
      });

      setFromValue("");
      setToValue("");
      
      setTimeout(() => {
        navigate('/');
      }, 1500);
    } catch (error) {
      console.error('Error updating data:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถอัพเดทข้อมูลได้",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const applyPreset = (preset: 'personal' | 'company') => {
    if (preset === 'personal') {
      setFromValue('personal');
      setToValue('ส่วนตัว');
    } else {
      setFromValue('company');
      setToValue('บริษัท');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-bold text-foreground">อัพเดทข้อมูล</h1>
        </div>

        <Card className="p-6 space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-2">แปลงข้อมูล</h2>
            <p className="text-muted-foreground mb-4">
              เลือกฟิลด์และกำหนดค่าที่ต้องการแปลง
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="field">เลือกฟิลด์</Label>
              <Select value={field} onValueChange={setField}>
                <SelectTrigger id="field">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="category">ประเภท (Category)</SelectItem>
                  <SelectItem value="project">โปรเจค (Project)</SelectItem>
                  <SelectItem value="subcategory">ประเภทย่อย (Subcategory)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="from">ค่าเดิม</Label>
                <Input
                  id="from"
                  value={fromValue}
                  onChange={(e) => setFromValue(e.target.value)}
                  placeholder="เช่น personal"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="to">ค่าใหม่</Label>
                <Input
                  id="to"
                  value={toValue}
                  onChange={(e) => setToValue(e.target.value)}
                  placeholder="เช่น ส่วนตัว"
                />
              </div>
            </div>

            <Button
              onClick={performMigration}
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              แปลงข้อมูล
            </Button>
          </div>

          <div className="pt-4 border-t">
            <p className="text-sm font-medium mb-3">ตัวเลือกด่วน:</p>
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={() => applyPreset('personal')}
                disabled={loading}
                variant="outline"
                size="sm"
              >
                personal → ส่วนตัว
              </Button>
              <Button
                onClick={() => applyPreset('company')}
                disabled={loading}
                variant="outline"
                size="sm"
              >
                company → บริษัท
              </Button>
            </div>
          </div>

          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">
              <strong>คำแนะนำ:</strong> เลือกฟิลด์ที่ต้องการแปลง ใส่ค่าเดิมและค่าใหม่ จากนั้นกดปุ่ม "แปลงข้อมูล" หรือใช้ปุ่มตัวเลือกด่วนสำหรับการแปลงที่ใช้บ่อย
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
