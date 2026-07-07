-- 1. Add updated_at column to mistakes table if not exists
ALTER TABLE public.mistakes ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- 2. Update existing rows to have updated_at equal to date
UPDATE public.mistakes SET updated_at = date WHERE updated_at IS NULL;

-- 3. Create VIEW for recent peer activities (bypassing RLS securely for read-only peer updates)
DROP VIEW IF EXISTS public.recent_peer_activities;

CREATE OR REPLACE VIEW public.recent_peer_activities AS
SELECT 
  m.id as mistake_id,
  m.user_id,
  p.display_name,
  split_part(p.email, '@', 1) as username,
  m.title,
  m.reviews,
  m.updated_at
FROM public.mistakes m
INNER JOIN public.profiles p ON p.id = m.user_id
WHERE m.reviews IS NOT NULL 
  AND (m.reviews->>0 != '' OR m.reviews->>1 != '' OR m.reviews->>2 != '')
ORDER BY m.updated_at DESC;

-- 4. Grant select permission to authenticated users
GRANT SELECT ON public.recent_peer_activities TO authenticated;
