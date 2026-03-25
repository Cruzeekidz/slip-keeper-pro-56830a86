import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, FileText, Building2, Upload } from "lucide-react";
import StaffRegistrationForm from "@/components/portal/StaffRegistrationForm";
import StaffInvoicePublicForm from "@/components/portal/StaffInvoicePublicForm";
import VendorRegistrationForm from "@/components/portal/VendorRegistrationForm";
import VendorBillUpload from "@/components/portal/VendorBillUpload";
import { useLiff } from "@/hooks/useLiff";

type PortalView = "menu" | "staff-register" | "staff-invoice" | "vendor-register" | "vendor-bill";

const VIEW_PARAM_MAP: Record<string, PortalView> = {
  "staff-register": "staff-register",
  "staff-invoice": "staff-invoice",
  "vendor-register": "vendor-register",
  "vendor-bill": "vendor-bill",
};

const getDecodedVariants = (value: string): string[] => {
  const variants = [value];
  let currentValue = value;

  for (let i = 0; i < 3; i += 1) {
    try {
      const decodedValue = decodeURIComponent(currentValue);
      if (decodedValue === currentValue) break;
      variants.push(decodedValue);
      currentValue = decodedValue;
    } catch {
      break;
    }
  }

  return [...new Set(variants)];
};

const extractParamsFromState = (state: string): URLSearchParams | null => {
  for (const variant of getDecodedVariants(state)) {
    const normalizedVariant = variant.replace(/^#/, "");
    const candidateQueries = [normalizedVariant];

    const questionIndex = normalizedVariant.indexOf("?");
    if (questionIndex !== -1) {
      candidateQueries.push(normalizedVariant.slice(questionIndex + 1));
    }

    const hashIndex = normalizedVariant.indexOf("#");
    if (hashIndex !== -1) {
      candidateQueries.push(normalizedVariant.slice(hashIndex + 1));
    }

    for (const candidateQuery of candidateQueries) {
      const cleanedQuery = candidateQuery.replace(/^.*\?/, "").replace(/^[?#]/, "");
      const params = new URLSearchParams(cleanedQuery);

      if (params.get("view") || params.get("owner")) {
        return params;
      }
    }
  }

  return null;
};

const getPortalParams = (): URLSearchParams => {
  const searchParams = new URLSearchParams(window.location.search);

  const mergedParams = new URLSearchParams(searchParams);

  const stateSources = [
    searchParams.get("liff.state"),
    window.location.hash,
    window.location.href,
  ].filter((value): value is string => Boolean(value));

  for (const source of stateSources) {
    const extractedParams = extractParamsFromState(source);
    if (extractedParams) {
      const extractedView = (extractedParams.get("view") || "").trim();
      const extractedOwner = (extractedParams.get("owner") || "").trim();
      const currentView = (mergedParams.get("view") || "").trim();
      const currentOwner = (mergedParams.get("owner") || "").trim();

      if (!currentView && extractedView) {
        mergedParams.set("view", extractedView);
      }

      if ((!UUID_REGEX.test(currentOwner) || currentOwner === "YOUR_USER_ID") && UUID_REGEX.test(extractedOwner)) {
        mergedParams.set("owner", extractedOwner);
      }
    }
  }

  return mergedParams;
};

const PublicPortal = () => {
  const parsedParams = getPortalParams();
  const parsedView = VIEW_PARAM_MAP[(parsedParams.get("view") || "").trim()] || "menu";
  const [manualView, setManualView] = useState<PortalView | null>(null);
  const view = manualView ?? parsedView;
  const { lineUserId, lineProfile } = useLiff();
  const ownerId = (parsedParams.get("owner") || "").trim();

  if (view !== "menu") {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-lg mx-auto pt-4">
          <Button variant="ghost" onClick={() => setManualView("menu")} className="mb-4">
            ← กลับเมนูหลัก
          </Button>
          {lineProfile && (
            <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
              {lineProfile.pictureUrl && (
                <img src={lineProfile.pictureUrl} alt="" className="h-6 w-6 rounded-full" />
              )}
              <span>LINE: {lineProfile.displayName}</span>
              <Badge variant="secondary" className="text-xs">เชื่อมต่อแล้ว</Badge>
            </div>
          )}
          {view === "staff-register" && <StaffRegistrationForm lineUserId={lineUserId} lineDisplayName={lineProfile?.displayName} ownerId={ownerId} />}
          {view === "staff-invoice" && <StaffInvoicePublicForm ownerId={ownerId} />}
          {view === "vendor-register" && <VendorRegistrationForm lineUserId={lineUserId} lineDisplayName={lineProfile?.displayName} ownerId={ownerId} />}
          {view === "vendor-bill" && <VendorBillUpload ownerId={ownerId} />}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-lg mx-auto pt-8 space-y-4">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">ระบบเอกสารและการเงิน</h1>
          <p className="text-muted-foreground mt-2">เลือกประเภทที่ต้องการดำเนินการ</p>
          {lineProfile && (
            <div className="mt-3 flex items-center justify-center gap-2 text-sm">
              {lineProfile.pictureUrl && (
                <img src={lineProfile.pictureUrl} alt="" className="h-7 w-7 rounded-full" />
              )}
              <span className="text-muted-foreground">สวัสดี, {lineProfile.displayName}</span>
              <Badge variant="secondary" className="text-xs">LINE เชื่อมต่อแล้ว</Badge>
            </div>
          )}
        </div>

        <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => setManualView("staff-register")}>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="bg-primary/10 p-3 rounded-lg">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">ลงทะเบียนทีมงานใหม่</CardTitle>
              <CardDescription>สมัครเป็นทีมงานฟรีแลนซ์ กรอกข้อมูลและแนบบัตรประชาชน</CardDescription>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => setManualView("staff-invoice")}>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="bg-blue-500/10 p-3 rounded-lg">
              <FileText className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <CardTitle className="text-base">ส่งแบบฟอร์มเรียกเก็บเงิน</CardTitle>
              <CardDescription>สำหรับทีมงานที่ลงทะเบียนแล้ว แจ้งวันทำงานและค่าแรง</CardDescription>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => setManualView("vendor-register")}>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="bg-green-500/10 p-3 rounded-lg">
              <Building2 className="h-6 w-6 text-green-500" />
            </div>
            <div>
              <CardTitle className="text-base">ลงทะเบียนคู่ค้า</CardTitle>
              <CardDescription>บริษัท/ร้านค้า ลงทะเบียนพร้อมแนบ ภพ.20 หรือบัตรประชาชน</CardDescription>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => setManualView("vendor-bill")}>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="bg-orange-500/10 p-3 rounded-lg">
              <Upload className="h-6 w-6 text-orange-500" />
            </div>
            <div>
              <CardTitle className="text-base">ส่งบิล / ใบแจ้งหนี้</CardTitle>
              <CardDescription>อัพโหลดไฟล์ภาพหรือ PDF ใบแจ้งหนี้จากคู่ค้า</CardDescription>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PublicPortal;
