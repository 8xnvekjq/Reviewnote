-- Add school_grade column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS school_grade text;

-- Comment on column
COMMENT ON COLUMN public.profiles.school_grade IS 'Student school grade/level (e.g. 중3, 고1)';
