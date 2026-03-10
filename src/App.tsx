import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import BulkUpload from "./pages/BulkUpload";
import DataMigration from "./pages/DataMigration";
import DuplicateChecker from "./pages/DuplicateChecker";
import DeletedHistory from "./pages/DeletedHistory";
import MasterData from "./pages/MasterData";
import TransactionReport from "./pages/TransactionReport";
import PayeeGroupManagement from "./pages/PayeeGroupManagement";
import LineWebhookSettings from "./pages/LineWebhookSettings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/bulk-upload" element={<BulkUpload />} />
            <Route path="/data-migration" element={<DataMigration />} />
            <Route path="/duplicate-checker" element={<DuplicateChecker />} />
            <Route path="/deleted-history" element={<DeletedHistory />} />
            <Route path="/master-data" element={<MasterData />} />
            <Route path="/transaction-report" element={<TransactionReport />} />
            <Route path="/payee-groups" element={<PayeeGroupManagement />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </TooltipProvider>
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
