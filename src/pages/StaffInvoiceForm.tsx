import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

// Route retained for backwards compatibility. All submissions now flow through
// the LIFF-gated /portal view so that LINE identity is verified before writes.
const StaffInvoiceForm = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    params.set("view", "staff-invoice");
    navigate(`/portal?${params.toString()}`, { replace: true });
  }, [searchParams, navigate]);

  return null;
};

export default StaffInvoiceForm;
