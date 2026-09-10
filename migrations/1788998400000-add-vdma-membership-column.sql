-- Initialize existing members to true without assuming membership for future rows.
ALTER TABLE public.vdma_members ADD COLUMN is_vdma_member BOOLEAN DEFAULT TRUE;
ALTER TABLE public.vdma_members ALTER COLUMN is_vdma_member DROP DEFAULT;
