import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Database, Layers, Tag, FolderTree, Users, Bot, Shield } from "lucide-react";
import {
  TRANSACTION_TYPES, CATEGORY_GROUPS, TRANSACTION_DIRECTIONS,
  TRANSFER_SUBCATEGORIES, EVENT_EXPENSE_SUBCATEGORIES, EVENT_INCOME_SUBCATEGORIES,
  PROGRAM_SUBCATEGORIES, VENUE_SUBCATEGORIES, GENERAL_SUBCATEGORIES,
  ENTITY_SUBCATEGORIES, BCC_NEXT_SUBCATEGORIES, PERSONAL_SUBCATEGORIES,
  DEFAULT_EVENT_TAGS, DEFAULT_PROGRAM_TAGS, DEFAULT_BCC_NEXT_TAGS,
} from "@/lib/category-constants";

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <Card className="p-6 space-y-4">
      <h2 className="text-xl font-bold flex items-center gap-2 text-foreground">
        <Icon className="h-5 w-5 text-primary" />
        {title}
      </h2>
      {children}
    </Card>
  );
}

function SubcatList({ items, label }: { items: string[]; label?: string }) {
  return (
    <div>
      {label && <p className="text-xs text-muted-foreground mb-1">{label}</p>}
      <div className="flex flex-wrap gap-1">
        {items.map(s => (
          <Badge key={s} variant="secondary" className="text-xs font-normal">{s}</Badge>
        ))}
      </div>
    </div>
  );
}

export default function SystemDocs() {
  const navigate = useNavigate();

  const handleDownload = () => {
    const content = generateMarkdown();
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'slip-keeper-system-docs.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">เอกสารโครงสร้างระบบ</h1>
              <p className="text-sm text-muted-foreground">System Architecture Documentation</p>
            </div>
          </div>
          <Button onClick={handleDownload} variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Download .md</span>
          </Button>
        </div>

        {/* 1. Overview */}
        <Section icon={Layers} title="1. ภาพรวมระบบ (System Overview)">
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <p className="text-muted-foreground">
              <strong>Slip Keeper Pro</strong> คือระบบจัดการค่าใช้จ่ายอัจฉริยะ รองรับ 3 ธุรกิจ (Entity) 
              โดยใช้ AI วิเคราะห์สลิปจาก LINE Bot แล้วจัดหมวดหมู่อัตโนมัติ พร้อมส่งต่อให้นักบัญชี
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
              <Card className="p-3 border-primary/30 bg-primary/5">
                <p className="font-semibold text-sm">Entity 1: ธุรกิจหลัก</p>
                <p className="text-xs text-muted-foreground">Event, Program, Venue, General</p>
              </Card>
              <Card className="p-3 border-primary/30 bg-primary/5">
                <p className="font-semibold text-sm">Entity 2: BCC Next</p>
                <p className="text-xs text-muted-foreground">Peca Bridge, EngineerX, Play Box</p>
              </Card>
              <Card className="p-3 border-primary/30 bg-primary/5">
                <p className="font-semibold text-sm">Entity 3: คู่ขนาน</p>
                <p className="text-xs text-muted-foreground">ธุรกิจแยกอิสระ</p>
              </Card>
            </div>
          </div>
        </Section>

        {/* 2. Category Hierarchy */}
        <Section icon={FolderTree} title="2. โครงสร้างหมวดหมู่ 3 ระดับ">
          <p className="text-sm text-muted-foreground">
            ทุกรายการต้องระบุ <code className="bg-muted px-1 rounded">transaction_type</code> → <code className="bg-muted px-1 rounded">category_group</code> → <code className="bg-muted px-1 rounded">subcategory</code> + ทิศทางเงิน (INCOME/EXPENSE)
          </p>

          {/* Transaction Types */}
          <div className="space-y-1">
            <h3 className="font-semibold text-sm">ระดับ 1: ประเภทธุรกรรม (transaction_type)</h3>
            <div className="flex gap-2">
              {TRANSACTION_TYPES.map(t => (
                <Badge key={t.value} className={t.color}>{t.label} ({t.value})</Badge>
              ))}
            </div>
          </div>

          {/* Direction */}
          <div className="space-y-1">
            <h3 className="font-semibold text-sm">ทิศทางเงิน (transaction_direction)</h3>
            <div className="flex gap-2">
              {TRANSACTION_DIRECTIONS.map(d => (
                <Badge key={d.value} variant="outline">{d.label} ({d.value})</Badge>
              ))}
            </div>
          </div>

          {/* Category Groups */}
          <div className="space-y-1">
            <h3 className="font-semibold text-sm">ระดับ 2: กลุ่ม (category_group) — เฉพาะ BUSINESS</h3>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_GROUPS.map(g => (
                <Badge key={g.value} variant="outline">{g.label} ({g.value})</Badge>
              ))}
            </div>
          </div>

          {/* TRANSFER */}
          <div className="border rounded-lg p-4 space-y-2">
            <h3 className="font-semibold text-sm text-type-transfer">🔄 TRANSFER — โอนเงิน</h3>
            <SubcatList items={TRANSFER_SUBCATEGORIES} />
          </div>

          {/* BUSINESS Groups */}
          <div className="border rounded-lg p-4 space-y-4">
            <h3 className="font-semibold text-sm text-type-business">💼 BUSINESS — ธุรกิจ</h3>

            <div className="pl-4 border-l-2 border-group-event/50 space-y-2">
              <p className="font-medium text-sm">EVENT — อีเวนท์ <span className="text-xs text-muted-foreground">(ใช้ project_tag: EVT-xxx)</span></p>
              <SubcatList items={EVENT_EXPENSE_SUBCATEGORIES} label="Expense" />
              <SubcatList items={EVENT_INCOME_SUBCATEGORIES} label="Income" />
              <SubcatList items={DEFAULT_EVENT_TAGS} label="Default Tags" />
            </div>

            <div className="pl-4 border-l-2 border-group-program/50 space-y-2">
              <p className="font-medium text-sm">PROGRAM — โปรแกรม <span className="text-xs text-muted-foreground">(ใช้ project_tag: PROG-xxx)</span></p>
              <SubcatList items={PROGRAM_SUBCATEGORIES} />
              <SubcatList items={DEFAULT_PROGRAM_TAGS} label="Default Tags" />
            </div>

            <div className="pl-4 border-l-2 border-group-venue/50 space-y-2">
              <p className="font-medium text-sm">VENUE — สนาม</p>
              <SubcatList items={VENUE_SUBCATEGORIES} />
            </div>

            <div className="pl-4 border-l-2 border-group-entity/50 space-y-2">
              <p className="font-medium text-sm">ENTITY_BCC_NEXT — BCC Next <span className="text-xs text-muted-foreground">(ใช้ project_tag: BCCNEXT-xxx)</span></p>
              <SubcatList items={BCC_NEXT_SUBCATEGORIES} />
              <SubcatList items={DEFAULT_BCC_NEXT_TAGS} label="Default Tags" />
            </div>

            <div className="pl-4 border-l-2 border-group-entity/50 space-y-2">
              <p className="font-medium text-sm">ENTITY_KUKANANG — คู่ขนาน</p>
              <SubcatList items={ENTITY_SUBCATEGORIES} />
            </div>

            <div className="pl-4 border-l-2 border-group-general/50 space-y-2">
              <p className="font-medium text-sm">GENERAL — ทั่วไป</p>
              <SubcatList items={GENERAL_SUBCATEGORIES} />
            </div>
          </div>

          {/* PERSONAL */}
          <div className="border rounded-lg p-4 space-y-2">
            <h3 className="font-semibold text-sm text-type-personal">👤 PERSONAL — ส่วนตัว</h3>
            <SubcatList items={PERSONAL_SUBCATEGORIES} />
          </div>
        </Section>

        {/* 3. Database Schema */}
        <Section icon={Database} title="3. โครงสร้างฐานข้อมูล (Database Schema)">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-semibold">ตาราง</th>
                  <th className="text-left p-2 font-semibold">หน้าที่</th>
                  <th className="text-left p-2 font-semibold">คีย์ฟิลด์</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[
                  ['expenses', 'รายรับรายจ่ายหลัก', 'transaction_type, category_group, project_tag, event_name, subcategory'],
                  ['deleted_expenses', 'รายการที่ลบ (soft delete)', 'original_expense_id, can_restore'],
                  ['event_registry', 'ทะเบียนชื่ออีเวนท์ + aliases', 'event_name, project_tag, aliases[]'],
                  ['import_history / import_items', 'ประวัติ CSV import + rollback', 'import_type, status, action_type'],
                  ['line_user_mappings', 'เชื่อม LINE ↔ Supabase user', 'line_user_id, supabase_user_id'],
                  ['line_user_roles', 'สิทธิ์ LINE user (admin/member)', 'line_user_id, role'],
                  ['forward_recipients', 'ผู้รับ forward สลิป (นักบัญชี)', 'line_user_id, forward_image, forward_summary'],
                  ['payee_groups', 'จับกลุ่มผู้รับเงิน', 'payee_pattern, group_name'],
                  ['link_codes', 'รหัสเชื่อม LINE', 'code, expires_at, used'],
                  ['user_roles', 'สิทธิ์ระบบ (admin/user/super_admin)', 'user_id, role (app_role enum)'],
                ].map(([table, desc, fields]) => (
                  <tr key={table}>
                    <td className="p-2 font-mono text-xs">{table}</td>
                    <td className="p-2 text-muted-foreground">{desc}</td>
                    <td className="p-2 text-xs">{fields}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* 4. Tag System */}
        <Section icon={Tag} title="4. ระบบ Tag และ Event Registry">
          <div className="space-y-3">
            <div>
              <h3 className="font-semibold text-sm mb-2">Project Tag Naming Convention</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                <Card className="p-3">
                  <p className="font-mono text-xs text-primary">EVT-[ชื่อ]</p>
                  <p className="text-xs text-muted-foreground">อีเวนท์ธุรกิจหลัก</p>
                </Card>
                <Card className="p-3">
                  <p className="font-mono text-xs text-primary">PROG-[ชื่อ]</p>
                  <p className="text-xs text-muted-foreground">โปรแกรม/คลาส</p>
                </Card>
                <Card className="p-3">
                  <p className="font-mono text-xs text-primary">BCCNEXT-[ชื่อ]</p>
                  <p className="text-xs text-muted-foreground">โครงการ BCC Next</p>
                </Card>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-sm mb-2">Event Registry — Auto Normalization</h3>
              <p className="text-xs text-muted-foreground mb-2">
                ตาราง <code className="bg-muted px-1 rounded">event_registry</code> เก็บชื่อมาตรฐานและ aliases 
                เมื่อ AI วิเคราะห์สลิปได้ชื่อที่ตรงกับ alias ระบบจะ normalize ให้อัตโนมัติ
              </p>
              <p className="text-xs text-muted-foreground">
                <strong>ตรรกะ:</strong> ค้นหาโดย lowercase + strip spaces → จับคู่กับ event_name, project_tag และ aliases[]
              </p>
            </div>
          </div>
        </Section>

        {/* 5. Storage */}
        <Section icon={FolderTree} title="5. ระบบจัดเก็บไฟล์ (Storage)">
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              Bucket: <code className="bg-muted px-1 rounded">receipts</code> (Private)
            </p>
            <div className="bg-muted/50 p-3 rounded font-mono text-xs space-y-1">
              <p>📁 line/</p>
              <p>&nbsp;&nbsp;📁 {'{userId}'}/ </p>
              <p>&nbsp;&nbsp;&nbsp;&nbsp;📁 BUSINESS/ </p>
              <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;📁 2026/ </p>
              <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;📁 03/ </p>
              <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;📄 {'{timestamp}'}_{'{messageId}'}.jpg</p>
              <p>&nbsp;&nbsp;&nbsp;&nbsp;📁 PERSONAL/ </p>
              <p>&nbsp;&nbsp;&nbsp;&nbsp;📁 TRANSFER/ </p>
            </div>
            <p className="text-xs text-muted-foreground">
              เข้าถึงผ่าน Signed URL (1 ชม. ดูทั่วไป, 24 ชม. แชร์คลังสลิป)
            </p>
          </div>
        </Section>

        {/* 6. LINE Bot Flow */}
        <Section icon={Bot} title="6. LINE Bot Flow">
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="bg-muted/50 p-4 rounded space-y-2 text-xs">
              <p>1️⃣ ผู้ใช้ส่ง Memo (ข้อความ) → บันทึกใน <code>line_pending_memos</code> (5 นาที)</p>
              <p>2️⃣ ผู้ใช้ส่งรูปสลิป/PDF → ดาวน์โหลดไฟล์จาก LINE API</p>
              <p>3️⃣ อัปโหลดไฟล์ไปยัง Storage (temp path ก่อน)</p>
              <p>4️⃣ ส่งรูป + memo ให้ AI วิเคราะห์ → ดึงข้อมูลธุรกรรม</p>
              <p>5️⃣ <strong>Event Normalization</strong> → ค้น event_registry จับคู่ aliases</p>
              <p>6️⃣ <strong>Time Sanitization</strong> → ตัด "น." ออก, validate HH:MM format</p>
              <p>7️⃣ <strong>Category Mapping</strong> → BUSINESS→ธุรกิจ, PERSONAL→ส่วนตัว, TRANSFER→โอนเงิน</p>
              <p>8️⃣ <strong>Duplicate Check</strong> → ตรวจ transaction_id หรือ amount+date+time</p>
              <p>9️⃣ ย้ายไฟล์ไปตาม folder structure จริง</p>
              <p>🔟 บันทึกลง <code>expenses</code> + ส่งต่อ (forward) ให้นักบัญชี</p>
            </div>
          </div>
        </Section>

        {/* 7. Roles & Security */}
        <Section icon={Shield} title="7. สิทธิ์และความปลอดภัย">
          <div className="space-y-3 text-sm">
            <div>
              <h3 className="font-semibold text-sm mb-1">App Roles (user_roles)</h3>
              <div className="flex gap-2">
                <Badge>super_admin</Badge>
                <Badge variant="secondary">admin</Badge>
                <Badge variant="outline">user</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">ใช้ SECURITY DEFINER function <code>has_role()</code> ป้องกัน RLS recursive</p>
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-1">LINE Roles (line_user_roles)</h3>
              <div className="flex gap-2">
                <Badge>admin</Badge>
                <Badge variant="secondary">accountant</Badge>
                <Badge variant="outline">member</Badge>
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-1">RLS Policy Pattern</h3>
              <p className="text-xs text-muted-foreground">
                ทุกตารางใช้ <code>auth.uid() = user_id</code> สำหรับ CRUD + <code>service_role</code> สำหรับ Edge Functions
              </p>
            </div>
          </div>
        </Section>

        {/* 8. Key Files */}
        <Section icon={Layers} title="8. ไฟล์สำคัญ (Key Files)">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-semibold">ไฟล์</th>
                  <th className="text-left p-2 font-semibold">หน้าที่</th>
                </tr>
              </thead>
              <tbody className="divide-y font-mono">
                {[
                  ['src/lib/category-constants.ts', 'นิยาม Type, Group, Subcategory, Tag ทั้งหมด'],
                  ['supabase/functions/line-webhook/index.ts', 'LINE Bot webhook + AI analysis + duplicate check + forward'],
                  ['supabase/functions/analyze-receipt/index.ts', 'Web upload AI analysis (prompt เดียวกัน)'],
                  ['src/components/expense-edit-dialog.tsx', 'ฟอร์มแก้ไขรายการ (Combobox สำหรับ subcategory, tag, event_name)'],
                  ['src/components/expense-list-real.tsx', 'ตารางรายการหลัก + ฟิลเตอร์'],
                  ['src/pages/ReceiptArchive.tsx', 'คลังสลิป (gallery + download + share)'],
                  ['src/pages/EventManagement.tsx', 'จัดการ Event Registry + aliases'],
                  ['src/pages/MasterData.tsx', 'จัดการข้อมูลหลัก (merge/rename)'],
                ].map(([file, desc]) => (
                  <tr key={file}>
                    <td className="p-2 text-primary">{file}</td>
                    <td className="p-2 text-muted-foreground font-sans">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground py-4">
          อัปเดตล่าสุด: {new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>
    </div>
  );
}

function generateMarkdown(): string {
  return `# Slip Keeper Pro — System Architecture Documentation

## 1. ภาพรวมระบบ

ระบบจัดการค่าใช้จ่ายอัจฉริยะ รองรับ 3 Entity:
- **Entity 1: ธุรกิจหลัก** — Event, Program, Venue, General
- **Entity 2: BCC Next** — Peca Bridge, EngineerX, Play Box
- **Entity 3: คู่ขนาน** — ธุรกิจแยกอิสระ

## 2. โครงสร้างหมวดหมู่ 3 ระดับ

### Level 1: transaction_type
| Value | Label |
|-------|-------|
| TRANSFER | โอนเงิน |
| BUSINESS | ธุรกิจ |
| PERSONAL | ส่วนตัว |

### Level 2: category_group (เฉพาะ BUSINESS)
| Value | Label | Tag Format |
|-------|-------|------------|
| EVENT | อีเวนท์ | EVT-xxx |
| PROGRAM | โปรแกรม | PROG-xxx |
| VENUE | สนาม | — |
| ENTITY_BCC_NEXT | BCC Next | BCCNEXT-xxx |
| ENTITY_KUKANANG | คู่ขนาน | — |
| GENERAL | ทั่วไป | — |

### Level 3: subcategory

**TRANSFER:** ${TRANSFER_SUBCATEGORIES.join(', ')}

**EVENT (Expense):** ${EVENT_EXPENSE_SUBCATEGORIES.join(', ')}
**EVENT (Income):** ${EVENT_INCOME_SUBCATEGORIES.join(', ')}

**PROGRAM:** ${PROGRAM_SUBCATEGORIES.join(', ')}
**VENUE:** ${VENUE_SUBCATEGORIES.join(', ')}
**BCC Next:** ${BCC_NEXT_SUBCATEGORIES.join(', ')}
**คู่ขนาน:** ${ENTITY_SUBCATEGORIES.join(', ')}
**GENERAL:** ${GENERAL_SUBCATEGORIES.join(', ')}
**PERSONAL:** ${PERSONAL_SUBCATEGORIES.join(', ')}

### transaction_direction
- EXPENSE (รายจ่าย)
- INCOME (รายรับ)

## 3. Default Tags

- **EVENT:** ${DEFAULT_EVENT_TAGS.join(', ')}
- **PROGRAM:** ${DEFAULT_PROGRAM_TAGS.join(', ')}
- **BCC Next:** ${DEFAULT_BCC_NEXT_TAGS.join(', ')}

## 4. Event Registry

ตาราง \`event_registry\` เก็บชื่อมาตรฐานและ aliases
- Normalization: lowercase + strip spaces → จับคู่ event_name, project_tag, aliases[]
- ระบบ auto-normalize ทั้งใน LINE webhook และ web upload

## 5. Storage Structure

\`\`\`
receipts/ (Private Bucket)
  line/{userId}/{category}/{year}/{month}/{timestamp}_{messageId}.jpg
\`\`\`

- Signed URL: 1 ชม. (ดูทั่วไป), 24 ชม. (แชร์คลังสลิป)

## 6. LINE Bot Flow

1. ผู้ใช้ส่ง Memo → บันทึกใน line_pending_memos (5 นาที)
2. ผู้ใช้ส่งรูปสลิป/PDF → ดาวน์โหลดจาก LINE API
3. อัปโหลดไป Storage (temp)
4. ส่งรูป + memo ให้ AI วิเคราะห์
5. Event Normalization จาก event_registry
6. Time Sanitization (ตัด "น.")
7. Category Mapping (BUSINESS→ธุรกิจ)
8. Duplicate Check (transaction_id หรือ amount+date+time)
9. ย้ายไฟล์ตาม folder structure
10. บันทึก expenses + forward ให้นักบัญชี

## 7. Roles & Security

### App Roles (user_roles)
- super_admin, admin, user
- ใช้ SECURITY DEFINER function \`has_role()\`

### LINE Roles (line_user_roles)
- admin, accountant, member

### RLS Pattern
- ทุกตาราง: \`auth.uid() = user_id\` + \`service_role\` for Edge Functions

## 8. Key Files

| ไฟล์ | หน้าที่ |
|------|--------|
| src/lib/category-constants.ts | นิยาม Type, Group, Subcategory, Tag |
| supabase/functions/line-webhook/index.ts | LINE Bot + AI + duplicate + forward |
| supabase/functions/analyze-receipt/index.ts | Web upload AI analysis |
| src/components/expense-edit-dialog.tsx | ฟอร์มแก้ไข (Combobox) |
| src/pages/EventManagement.tsx | จัดการ Event Registry |
| src/pages/MasterData.tsx | จัดการข้อมูลหลัก |

---
อัปเดตล่าสุด: ${new Date().toISOString().split('T')[0]}
`;
}
