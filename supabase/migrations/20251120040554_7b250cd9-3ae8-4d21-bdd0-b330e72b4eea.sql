-- Create table for import history
CREATE TABLE public.import_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  imported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  file_name TEXT,
  total_rows INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  update_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  import_type TEXT NOT NULL DEFAULT 'csv', -- csv, bulk_receipt, etc.
  status TEXT NOT NULL DEFAULT 'completed', -- completed, rolled_back
  rolled_back_at TIMESTAMP WITH TIME ZONE,
  notes TEXT
);

-- Create table for import items (detailed records)
CREATE TABLE public.import_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  import_history_id UUID NOT NULL REFERENCES public.import_history(id) ON DELETE CASCADE,
  expense_id UUID NOT NULL,
  action_type TEXT NOT NULL, -- insert, update
  row_number INTEGER,
  row_data JSONB, -- Store original data for rollback
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.import_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for import_history
CREATE POLICY "Users can view their own import history"
ON public.import_history
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own import history"
ON public.import_history
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own import history"
ON public.import_history
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own import history"
ON public.import_history
FOR DELETE
USING (auth.uid() = user_id);

-- RLS Policies for import_items
CREATE POLICY "Users can view their own import items"
ON public.import_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.import_history
    WHERE import_history.id = import_items.import_history_id
    AND import_history.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create their own import items"
ON public.import_items
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.import_history
    WHERE import_history.id = import_items.import_history_id
    AND import_history.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own import items"
ON public.import_items
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.import_history
    WHERE import_history.id = import_items.import_history_id
    AND import_history.user_id = auth.uid()
  )
);

-- Create indexes for better performance
CREATE INDEX idx_import_history_user_id ON public.import_history(user_id);
CREATE INDEX idx_import_history_imported_at ON public.import_history(imported_at DESC);
CREATE INDEX idx_import_items_import_history_id ON public.import_items(import_history_id);
CREATE INDEX idx_import_items_expense_id ON public.import_items(expense_id);