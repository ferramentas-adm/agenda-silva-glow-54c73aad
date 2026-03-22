UPDATE public.closers SET business_hours_start = '09:00', business_hours_end = '23:00' WHERE business_hours_start = '07:00' AND business_hours_end = '22:00';
ALTER TABLE public.closers ALTER COLUMN business_hours_start SET DEFAULT '09:00';
ALTER TABLE public.closers ALTER COLUMN business_hours_end SET DEFAULT '23:00';