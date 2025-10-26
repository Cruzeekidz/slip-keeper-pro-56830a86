import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, RefreshCw, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function DataMigration() {
  const [loading, setLoading] = useState(false);
  const [field, setField] = useState<string>("category");
  const [fromValue, setFromValue] = useState<string>("");
  const [toValue, setToValue] = useState<string>("");
  const [useCondition, setUseCondition] = useState(false);
  const [conditionField, setConditionField] = useState<string>("project");
  const [conditionValues, setConditionValues] = useState<string[]>([]);
  const [availableProjects, setAvailableProjects] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const fetchProjects = async () => {
      const { data } = await supabase
        .from('expenses')
        .select('project')
        .order('project');
      
      const uniqueProjects = [...new Set(data?.map(item => item.project).filter(Boolean) || [])] as string[];
      setAvailableProjects(uniqueProjects);
    };

    fetchProjects();
  }, []);

  const addConditionValue = () => {
    if (selectedProject && !conditionValues.includes(selectedProject)) {
      setConditionValues([...conditionValues, selectedProject]);
      setSelectedProject("");
    }
  };

  const removeConditionValue = (value: string) => {
    setConditionValues(conditionValues.filter(v => v !== value));
  };

  const performMigration = async () => {
    if (!fromValue.trim() || !toValue.trim()) {
      toast({
        title: "กรุณากรอกข้อมูล",
        description: "กรุณากรอกค่าเดิมและค่าใหม่",
        variant: "destructive",
      });
      return;
    }

    if (useCondition && conditionValues.length === 0) {
      toast({
        title: "กรุณากรอกข้อมูล",
        description: "กรุณาเพิ่มค่าเงื่อนไขอย่างน้อย 1 รายการ",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      let query;
      
      if (field === 'category') {
        query = supabase
          .from('expenses')
          .update({ category: toValue })
          .eq('category', fromValue);
      } else if (field === 'project') {
        query = supabase
          .from('expenses')
          .update({ project: toValue })
          .eq('project', fromValue);
      } else {
        query = supabase
          .from('expenses')
          .update({ subcategory: toValue })
          .eq('subcategory', fromValue);
      }
      
      if (useCondition && conditionValues.length > 0) {
        query = query.in(conditionField as any, conditionValues);
      }
      
      const result = await query.select();

      const { error, data } = result;

      if (error) throw error;

      const conditionText = useCondition ? ` โดยมีเงื่อนไข ${conditionField} เป็น [${conditionValues.join(', ')}]` : '';
      toast({
        title: "อัพเดทสำเร็จ",
        description: `แปลง ${field} จาก "${fromValue}" เป็น "${toValue}"${conditionText} จำนวน ${data?.length || 0} รายการ`,
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

            <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="use-condition" 
                  checked={useCondition}
                  onCheckedChange={(checked) => setUseCondition(checked as boolean)}
                />
                <Label htmlFor="use-condition" className="cursor-pointer">
                  เพิ่มเงื่อนไขการแปลง
                </Label>
              </div>

              {useCondition && (
                <div className="space-y-4 pl-6 border-l-2 border-primary/30">
                  <div className="space-y-2">
                    <Label htmlFor="condition-field">ฟิลด์เงื่อนไข</Label>
                    <Select value={conditionField} onValueChange={setConditionField}>
                      <SelectTrigger id="condition-field">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="category">ประเภท (Category)</SelectItem>
                        <SelectItem value="project">โปรเจค (Project)</SelectItem>
                        <SelectItem value="subcategory">ประเภทย่อย (Subcategory)</SelectItem>
                        <SelectItem value="merchant">ร้านค้า (Merchant)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="condition-value">เพิ่มค่าเงื่อนไข</Label>
                    <div className="flex gap-2">
                      {conditionField === 'project' ? (
                        <Select value={selectedProject} onValueChange={setSelectedProject}>
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="เลือกโปรเจค" />
                          </SelectTrigger>
                          <SelectContent className="bg-popover">
                            {availableProjects.map((project) => (
                              <SelectItem key={project} value={project}>
                                {project}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          className="flex-1"
                          value={selectedProject}
                          onChange={(e) => setSelectedProject(e.target.value)}
                          placeholder="ระบุค่าเงื่อนไข"
                        />
                      )}
                      <Button
                        type="button"
                        onClick={addConditionValue}
                        disabled={!selectedProject}
                        size="sm"
                      >
                        เพิ่ม
                      </Button>
                    </div>
                  </div>

                  {conditionValues.length > 0 && (
                    <div className="space-y-2">
                      <Label>รายการค่าเงื่อนไข ({conditionValues.length})</Label>
                      <div className="flex flex-wrap gap-2">
                        {conditionValues.map((value) => (
                          <div
                            key={value}
                            className="flex items-center gap-1 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm"
                          >
                            <span>{value}</span>
                            <button
                              type="button"
                              onClick={() => removeConditionValue(value)}
                              className="hover:bg-primary/20 rounded-full p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded border border-blue-200 dark:border-blue-800">
                    <p className="text-xs text-blue-800 dark:text-blue-200">
                      <strong>ตัวอย่าง:</strong> ถ้า {conditionField} เป็น {conditionValues.length > 0 ? `[${conditionValues.join(', ')}]` : '[...]'} 
                      ให้เปลี่ยน {field} จาก "{fromValue || '...'}" เป็น "{toValue || '...'}"
                    </p>
                  </div>
                </div>
              )}
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
              <strong>คำแนะนำ:</strong> เลือกฟิลด์ที่ต้องการแปลง ใส่ค่าเดิมและค่าใหม่ จากนั้นกดปุ่ม "แปลงข้อมูล" 
              หากต้องการกำหนดเงื่อนไข เช่น "ถ้า project เป็น Central Westgate ให้เปลี่ยน category จาก บริษัท เป็น event" 
              ให้เลือก "เพิ่มเงื่อนไขการแปลง"
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
