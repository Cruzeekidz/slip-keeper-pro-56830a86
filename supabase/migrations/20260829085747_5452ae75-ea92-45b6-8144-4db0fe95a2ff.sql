-- ========== 1. New columns ==========
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS entity text;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS item_quantity integer;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS subcategory_backup text;
ALTER TABLE public.event_registry ADD COLUMN IF NOT EXISTS entity text;

-- ========== 2. Backup before migrating ==========
UPDATE public.expenses
SET category_group_backup = category_group
WHERE category_group_backup IS NULL AND category_group IS NOT NULL;

UPDATE public.expenses
SET subcategory_backup = subcategory
WHERE subcategory_backup IS NULL AND subcategory IS NOT NULL;

-- ========== 3. Clean literal junk strings ==========
UPDATE public.expenses
SET project_tag = NULL, needs_review = true
WHERE project_tag IN ('null','NULL','None','none','undefined','Unknown','unknown','N/A','-','');

UPDATE public.expenses
SET event_name = NULL, needs_review = true
WHERE event_name IN ('null','NULL','None','none','undefined','Unknown','unknown','N/A','-','');

UPDATE public.expenses
SET category_group = NULL, needs_review = true
WHERE category_group IN ('null','NULL','None','none','undefined','Unknown','unknown','N/A','-','');

UPDATE public.expenses
SET subcategory = NULL
WHERE subcategory IN ('null','NULL','None','none','undefined','Unknown','unknown','N/A','-','');

-- ========== 4. Entity migration ==========
UPDATE public.expenses SET entity = 'EDUCATION'
WHERE entity IS NULL AND category_group_backup = 'ENTITY_BCC_NEXT';

UPDATE public.expenses SET entity = 'KUKANANG'
WHERE entity IS NULL AND category_group_backup = 'ENTITY_KUKANANG';

UPDATE public.expenses SET entity = 'PERSONAL'
WHERE entity IS NULL AND transaction_type = 'PERSONAL';

UPDATE public.expenses SET entity = 'MENGXIN'
WHERE entity IS NULL;

-- Entity groups are no longer category groups: they become PROGRAM work types
UPDATE public.expenses SET category_group = 'PROGRAM'
WHERE category_group IN ('ENTITY_BCC_NEXT','ENTITY_KUKANANG');

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_entity_check
  CHECK (entity IS NULL OR entity IN ('MENGXIN','ACADEMY','EDUCATION','KUKANANG','PERSONAL'));

ALTER TABLE public.expenses ALTER COLUMN entity SET DEFAULT 'MENGXIN';

CREATE INDEX IF NOT EXISTS idx_expenses_entity ON public.expenses (entity);
CREATE INDEX IF NOT EXISTS idx_expenses_entity_date ON public.expenses (entity, expense_date);

-- ========== 5. event_registry entity ==========
UPDATE public.event_registry SET entity = 'MENGXIN' WHERE entity IS NULL;
ALTER TABLE public.event_registry ALTER COLUMN entity SET DEFAULT 'MENGXIN';
ALTER TABLE public.event_registry ALTER COLUMN entity SET NOT NULL;
ALTER TABLE public.event_registry
  ADD CONSTRAINT event_registry_entity_check
  CHECK (entity IN ('MENGXIN','ACADEMY','EDUCATION','KUKANANG','PERSONAL'));

-- ========== 6. Subcategory -> ReadyGo vocabulary (business expenses only) ==========
UPDATE public.expenses SET subcategory = CASE
  WHEN subcategory IN ('Staff','Salary','Salary/Wage','เงินเดือน','ทีมขาย','ครูสอนประจำสนาม','สตาร์ฟอีเว้นต์','Teaching','สวัสดิการสุขภาพ','สวัสดิการอาหาร') THEN 'staff'
  WHEN subcategory IN ('จ้างรายวัน','Part time ','Part time','ช่างภาพ','Photos & Video','VDO','Consulting','Accounting','Legal') THEN 'freelance'
  WHEN subcategory IN ('MC','ผู้ดำเนินการ') THEN 'mc_fee'
  WHEN subcategory IN ('Transport','Logistics','Travel','ค่าเดินทาง/น้ำมัน','Vehicle') THEN 'transport'
  WHEN subcategory IN ('Food & Drinks','Food') THEN 'food'
  WHEN subcategory IN ('Printing','Artwork & Printing') THEN 'printing'
  WHEN subcategory IN ('Venue','venue') THEN 'venue_rental'
  WHEN subcategory IN ('Marketing','Marketing & Ads','Advertising') THEN 'advertising'
  WHEN subcategory IN ('Insurance') THEN 'insurance'
  WHEN subcategory IN ('Equipment','อุปกรณ์จัดงาน ','แรมป์ อุปกรณ์งานแข่ง','Maintenance') THEN 'equipment'
  WHEN subcategory IN ('Prizes') THEN 'trophy'
  WHEN subcategory IN ('Gift') THEN 'giveaway'
  ELSE 'other_expense'
END
WHERE transaction_type = 'BUSINESS'
  AND transaction_direction = 'EXPENSE'
  AND subcategory IS NOT NULL;