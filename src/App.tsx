import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { AppLayout } from "./components/app-layout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import BulkUpload from "./pages/BulkUpload";
import DataMigration from "./pages/DataMigration";
import DuplicateChecker from "./pages/DuplicateChecker";
import MasterData from "./pages/MasterData";
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
            <Route path="/auth" element={<Auth />} />
            <Route element={<AppLayout><Index /></AppLayout>}>
              <Route path="/" element={<Index />} />
            </Route>
            <Route element={<AppLayout><BulkUpload /></AppLayout>}>
              <Route path="/bulk-upload" element={<BulkUpload />} />
            </Route>
            <Route element={<AppLayout><DataMigration /></AppLayout>}>
              <Route path="/data-migration" element={<DataMigration />} />
            </Route>
            <Route element={<AppLayout><DuplicateChecker /></AppLayout>}>
              <Route path="/duplicate-checker" element={<DuplicateChecker />} />
            </Route>
            <Route element={<AppLayout><MasterData /></AppLayout>}>
              <Route path="/master-data" element={<MasterData />} />
            </Route>
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </TooltipProvider>
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
