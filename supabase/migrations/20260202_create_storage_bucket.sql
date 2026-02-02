-- map-thumbnails 스토리지 버킷 생성
INSERT INTO storage.buckets (id, name, public)
VALUES ('map-thumbnails', 'map-thumbnails', true)
ON CONFLICT (id) DO NOTHING;

-- 스토리지 정책: 누구나 조회 가능 (public)
CREATE POLICY "Public thumbnail access"
ON storage.objects FOR SELECT
USING (bucket_id = 'map-thumbnails');

-- 스토리지 정책: 인증된 사용자만 업로드 가능
CREATE POLICY "Authenticated users can upload thumbnails"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'map-thumbnails'
  AND auth.role() = 'authenticated'
);

-- 스토리지 정책: 자기 폴더만 수정/삭제 가능
CREATE POLICY "Users can manage own thumbnails"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'map-thumbnails'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own thumbnails"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'map-thumbnails'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
