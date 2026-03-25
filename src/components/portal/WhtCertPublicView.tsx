import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Printer, Download, Loader2 } from "lucide-react";
import { numberToThaiText } from "@/lib/thai-baht-text";
import { INCOME_TYPES, PND_TYPES, PAYER_CONDITION_OPTIONS } from "@/lib/wht-constants";
import companyStampUrl from "@/assets/company-stamp.png";

interface WhtCertPublicViewProps {
  certId: string;
}

interface CertData {
  id: string;
  doc_number: string | null;
  issue_date: string;
  pnd_type: string;
  payer_condition: string;
  payer_name: string | null;
  payer_tax_id: string | null;
  payer_address: string | null;
  payee_name: string;
  payee_tax_id: string | null;
  payee_address: string | null;
  payee_type: string;
  total_gross: number;
  total_tax: number;
  total_tax_text: string | null;
  status: string;
}

interface CertItem {
  income_type_index: number;
  income_type_label: string;
  payment_date: string | null;
  gross_amount: number;
  tax_rate: number;
  tax_amount: number;
}

const WhtCertPublicView = ({ certId }: WhtCertPublicViewProps) => {
  const [cert, setCert] = useState<CertData | null>(null);
  const [items, setItems] = useState<CertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error: rpcError } = await (supabase.rpc as any)("get_wht_certificate_public", {
        p_cert_id: certId,
      });

      if (rpcError || !data) {
        setError("ไม่พบเอกสาร หรือเอกสารยังไม่สมบูรณ์");
        setLoading(false);
        return;
      }

      const result = data as any;
      setCert(result.certificate);
      setItems(result.items || []);
      setLoading(false);
    };
    load();
  }, [certId]);

  const handlePrint = async () => {
    if (!cert) return;

    let stampBase64 = "";
    try {
      const response = await fetch(companyStampUrl);
      const blob = await response.blob();
      stampBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn("Could not load stamp image", e);
    }

    const formatTaxIdBoxes = (digits: string) => {
      return (digits || "").replace(/\D/g, "").padEnd(13, " ").split("").map(d =>
        `<span class="tax-box">${d.trim()}</span>`
      ).join("");
    };

    const payerTaxBoxes = formatTaxIdBoxes(cert.payer_tax_id || "");
    const payeeTaxBoxes = formatTaxIdBoxes(cert.payee_tax_id || "");
    const issueDateThai = new Date(cert.issue_date).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });

    const lineItemsHtml = items.map(item => {
      return `<tr>
        <td>${item.income_type_label}</td>
        <td style="text-align:center;">${item.payment_date ? new Date(item.payment_date).toLocaleDateString("th-TH") : "-"}</td>
        <td style="text-align:right;">${item.gross_amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
        <td style="text-align:right;">${item.tax_amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
      </tr>`;
    }).join("");

    const stampHtml = stampBase64
      ? `<img src="${stampBase64}" style="width:180px;height:auto;margin-bottom:5px;" />`
      : "";

    const html = `<!DOCTYPE html>
<html lang="th"><head><meta charset="UTF-8">
<title>หนังสือรับรองหัก ณ ที่จ่าย - ${cert.payee_name}</title>
<style>
  @media print { body { margin: 0; } @page { size: A4; margin: 15mm; } .no-print { display: none; } }
  body { font-family: 'Sarabun', 'TH Sarabun New', sans-serif; font-size: 14px; line-height: 1.6; max-width: 700px; margin: 20px auto; padding: 20px; }
  .header { text-align: center; margin-bottom: 15px; }
  .header h2 { margin: 5px 0; font-size: 18px; }
  .header h3 { margin: 5px 0; font-size: 15px; font-weight: normal; }
  .section { border: 1px solid #000; padding: 10px 15px; margin-bottom: 8px; }
  .row { display: flex; justify-content: space-between; margin: 3px 0; }
  .label { font-weight: bold; min-width: 180px; }
  table.income { width: 100%; border-collapse: collapse; margin: 10px 0; }
  table.income th, table.income td { border: 1px solid #000; padding: 5px 8px; font-size: 13px; }
  table.income th { background: #f0f0f0; text-align: center; }
  .tax-box { display:inline-block;width:20px;height:24px;border:1px solid #000;text-align:center;line-height:24px;font-size:13px;margin:0 1px; }
  .checkbox { display:inline-block;width:14px;height:14px;border:1px solid #000;margin-right:4px;vertical-align:middle;text-align:center;line-height:14px;font-size:11px; }
  .checked { background:#000;color:#fff; }
  .sign-section { display:flex;justify-content:space-between;margin-top:40px; }
  .sign-box { text-align:center;width:45%; }
  .sign-line { border-top:1px dotted #000;margin-top:10px;padding-top:5px; }
  .stamp-area { min-height:80px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end; }
  .print-btn { background:#e11d48;color:white;border:none;padding:12px 30px;font-size:16px;cursor:pointer;border-radius:6px;display:block;margin:20px auto; }
</style></head><body>
<button class="print-btn no-print" onclick="window.print()">🖨️ พิมพ์ / บันทึก PDF</button>
<div class="header">
  <h2>หนังสือรับรองการหักภาษี ณ ที่จ่าย</h2>
  <h3>ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</h3>
</div>
<div class="section">
  <div style="display:flex;justify-content:space-between;align-items:center;">
    <div>
      ${PND_TYPES.map(p => `<span class="checkbox ${cert.pnd_type === p.value ? 'checked' : ''}">${cert.pnd_type === p.value ? '✓' : '&ensp;'}</span> ${p.label}&nbsp;&nbsp;`).join("")}
    </div>
    <div style="font-size:13px;">เลขที่ ${cert.doc_number || "............"} &nbsp; วันที่ ${new Date(cert.issue_date).toLocaleDateString("th-TH")}</div>
  </div>
</div>
<div class="section">
  <p style="font-weight:bold;margin:0 0 6px;">ผู้มีหน้าที่หักภาษี ณ ที่จ่าย</p>
  <div class="row"><span class="label">ชื่อ:</span><span>${cert.payer_name || "-"}</span></div>
  <div class="row"><span class="label">เลขประจำตัวผู้เสียภาษี:</span><span>${payerTaxBoxes}</span></div>
  <div class="row"><span class="label">ที่อยู่:</span><span>${cert.payer_address || "-"}</span></div>
</div>
<div class="section">
  <p style="font-weight:bold;margin:0 0 6px;">ผู้ถูกหักภาษี ณ ที่จ่าย</p>
  <div class="row"><span class="label">ชื่อ:</span><span>${cert.payee_name}</span></div>
  <div class="row"><span class="label">เลขประจำตัวผู้เสียภาษี:</span><span>${payeeTaxBoxes}</span></div>
  <div class="row"><span class="label">ที่อยู่:</span><span>${cert.payee_address || "-"}</span></div>
</div>
<table class="income">
  <thead><tr>
    <th>ประเภทเงินได้พึงประเมินที่จ่าย</th>
    <th>วัน เดือน ปี ที่จ่าย</th>
    <th>จำนวนเงินที่จ่าย</th>
    <th>ภาษีที่หักและนำส่งไว้</th>
  </tr></thead>
  <tbody>
    ${lineItemsHtml}
    <tr style="font-weight:bold;background:#f9f9f9;">
      <td colspan="2" style="text-align:center;">รวมเงินที่จ่ายและภาษีที่หักนำส่ง</td>
      <td style="text-align:right;">${cert.total_gross.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
      <td style="text-align:right;">${cert.total_tax.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
    </tr>
  </tbody>
</table>
<p style="font-size:13px;">รวมเงินภาษีที่หักนำส่ง (ตัวอักษร): <strong>${cert.total_tax_text || numberToThaiText(cert.total_tax)}</strong></p>
<div style="margin:12px 0;">
  ${PAYER_CONDITION_OPTIONS.map(c => `<span class="checkbox ${cert.payer_condition === c.value ? 'checked' : ''}">${cert.payer_condition === c.value ? '✓' : '&ensp;'}</span> ${c.label}&nbsp;&nbsp;`).join("")}
</div>
<div class="sign-section">
  <div class="sign-box">
    <div class="stamp-area">${stampHtml}</div>
    <div class="sign-line">ผู้จ่ายเงิน</div>
    <p style="font-size:12px;margin:4px 0 0;">${cert.payer_name || ""}</p>
    <p style="font-size:12px;margin:2px 0;">วันที่ ${issueDateThai}</p>
  </div>
  <div class="sign-box">
    <div class="stamp-area"></div>
    <div class="sign-line">ผู้รับเงิน</div>
    <p style="font-size:12px;margin:4px 0 0;">วันที่ ........./........./.........</p>
  </div>
</div>
</body></html>`;

    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground mt-2">กำลังโหลดเอกสาร...</p>
      </div>
    );
  }

  if (error || !cert) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <p className="text-muted-foreground">{error || "ไม่พบเอกสาร"}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">หนังสือรับรองหัก ณ ที่จ่าย</CardTitle>
            <Badge>ภ.ง.ด.{cert.pnd_type}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            เลขที่ {cert.doc_number || "-"} • วันที่ {new Date(cert.issue_date).toLocaleDateString("th-TH")}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Payer */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">ผู้จ่ายเงิน</p>
            <p className="text-sm font-medium">{cert.payer_name}</p>
            <p className="text-xs text-muted-foreground">เลขภาษี: {cert.payer_tax_id || "-"}</p>
          </div>
          <Separator />
          {/* Payee */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">ผู้รับเงิน</p>
            <p className="text-sm font-medium">{cert.payee_name}</p>
            <p className="text-xs text-muted-foreground">เลขภาษี: {cert.payee_tax_id || "-"}</p>
            <p className="text-xs text-muted-foreground">ที่อยู่: {cert.payee_address || "-"}</p>
          </div>
          <Separator />
          {/* Items */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">รายการเงินได้</p>
            {items.map((item, i) => (
              <div key={i} className="flex justify-between text-sm py-1 border-b last:border-0">
                <span>{item.income_type_label}</span>
                <span className="text-right">
                  {item.gross_amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} / ภาษี {item.tax_amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
          <Separator />
          {/* Totals */}
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>รวมเงินที่จ่าย</span>
              <span className="font-bold">{cert.total_gross.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>รวมภาษีที่หัก</span>
              <span className="font-bold text-destructive">{cert.total_tax.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท</span>
            </div>
            <p className="text-xs text-muted-foreground">({cert.total_tax_text || numberToThaiText(cert.total_tax)})</p>
          </div>
        </CardContent>
      </Card>

      <Button className="w-full" onClick={handlePrint}>
        <Printer className="h-4 w-4 mr-2" /> พิมพ์ / ดาวน์โหลด PDF
      </Button>
    </div>
  );
};

export default WhtCertPublicView;
