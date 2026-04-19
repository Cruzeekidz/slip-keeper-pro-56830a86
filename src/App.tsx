import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";

// หน้าหลักที่ใช้บ่อย — โหลดปกติ
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// หน้าที่เหลือ — lazy load เมื่อ navigate ไปจริง
const Dashboard          = lazy(() => import("./pages/Dashboard"));
const BulkUpload         = lazy(() => import("./pages/BulkUpload"));
const DataMigration      = lazy(() => import("./pages/DataMigration"));
const DuplicateChecker   = lazy(() => import("./pages/DuplicateChecker"));
const DeletedHistory     = lazy(() => import("./pages/DeletedHistory"));
const MasterData         = lazy(() => import("./pages/MasterData"));
const TransactionReport  = lazy(() => import("./pages/TransactionReport"));
const PayeeGroupManagement = lazy(() => import("./pages/PayeeGroupManagement"));
const LineWebhookSettings  = lazy(() => import("./pages/LineWebhookSettings"));
const EventManagement    = lazy(() => import("./pages/EventManagement"));
const ForwardManagement  = lazy(() => import("./pages/ForwardManagement"));
const LineUserRoles      = lazy(() => import("./pages/LineUserRoles"));
const LinkLine           = lazy(() => import("./pages/LinkLine"));
const ResetPassword      = lazy(() => import("./pages/ResetPassword"));
const SystemAdmin        = lazy(() => import("./pages/SystemAdmin"));
const ReceiptArchive     = lazy(() => import("./pages/ReceiptArchive"));
const SystemDocs         = lazy(() => import("./pages/SystemDocs"));
const ReviewQueue        = lazy(() => import("./pages/ReviewQueue"));
const EventPnL           = lazy(() => import("./pages/EventPnL"));
const StaffManagement    = lazy(() => import("./pages/StaffManagement"));
const StaffInvoiceForm   = lazy(() => import("./pages/StaffInvoiceForm"));
const StaffPayments      = lazy(() => import("./pages/StaffPayments"));
const PaymentQueue       = lazy(() => import("./pages/PaymentQueue"));
const PublicPortal       = lazy(() => import("./pages/PublicPortal"));
const VendorManagement   = lazy(() => import("./pages/VendorManagement"));
const WhtReport          = lazy(() => import("./pages/WhtReport"));
const WhtCertificateList = lazy(() => import("./pages/WhtCertificateList"));
const BankAccounts       = lazy(() => import("./pages/BankAccounts"));
const DocumentHub        = lazy(() => import("./pages/DocumentHub"));

const PageLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <p className="text-muted-foreground">กำลังโหลด...</p>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: { retry: 0 }
  }
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/bulk-upload" element={<BulkUpload />} />
              <Route path="/data-migration" element={<DataMigration />} />
              <Route path="/duplicate-checker" element={<DuplicateChecker />} />
              <Route path="/deleted-history" element={<DeletedHistory />} />
              <Route path="/master-data" element={<MasterData />} />
              <Route path="/transaction-report" element={<TransactionReport />} />
              <Route path="/payee-groups" element={<PayeeGroupManagement />} />
              <Route path="/line-webhook" element={<LineWebhookSettings />} />
              <Route path="/event-management" element={<EventManagement />} />
              <Route path="/forward-management" element={<ForwardManagement />} />
              <Route path="/line-user-roles" element={<LineUserRoles />} />
              <Route path="/link-line" element={<LinkLine />} />
              <Route path="/system-admin" element={<SystemAdmin />} />
              <Route path="/receipt-archive" element={<ReceiptArchive />} />
              <Route path="/system-docs" element={<SystemDocs />} />
              <Route path="/review-queue" element={<ReviewQueue />} />
              <Route path="/event-pnl" element={<EventPnL />} />
              <Route path="/staff-management" element={<StaffManagement />} />
              <Route path="/staff-invoice" element={<StaffInvoiceForm />} />
              <Route path="/staff-payments" element={<StaffPayments />} />
              <Route path="/payment-queue" element={<PaymentQueue />} />
              <Route path="/portal" element={<PublicPortal />} />
              <Route path="/vendor-management" element={<VendorManagement />} />
              <Route path="/wht-report" element={<WhtReport />} />
              <Route path="/wht-certificates" element={<WhtCertificateList />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </TooltipProvider>
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
