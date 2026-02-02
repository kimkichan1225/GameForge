-- Race 맵 테이블 생성
CREATE TABLE IF NOT EXISTS public.maps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  creator_id UUID REFERENCES auth.users(id) NOT NULL,
  creator_username VARCHAR(50) NOT NULL,
  mode VARCHAR(20) NOT NULL DEFAULT 'race',
  data JSONB NOT NULL,
  thumbnail_url TEXT,
  play_count INTEGER DEFAULT 0,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_maps_creator_id ON public.maps(creator_id);
CREATE INDEX IF NOT EXISTS idx_maps_mode ON public.maps(mode);
CREATE INDEX IF NOT EXISTS idx_maps_is_public ON public.maps(is_public);
CREATE INDEX IF NOT EXISTS idx_maps_created_at ON public.maps(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_maps_play_count ON public.maps(play_count DESC);

-- RLS 활성화
ALTER TABLE public.maps ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 공개 맵은 누구나 조회 가능
CREATE POLICY "Public maps viewable" ON public.maps
  FOR SELECT USING (is_public = true);

-- RLS 정책: 자기 맵은 항상 조회 가능
CREATE POLICY "Own maps viewable" ON public.maps
  FOR SELECT USING (auth.uid() = creator_id);

-- RLS 정책: 자기 맵만 생성 가능
CREATE POLICY "Insert own maps" ON public.maps
  FOR INSERT WITH CHECK (auth.uid() = creator_id);

-- RLS 정책: 자기 맵만 수정 가능
CREATE POLICY "Update own maps" ON public.maps
  FOR UPDATE USING (auth.uid() = creator_id);

-- RLS 정책: 자기 맵만 삭제 가능
CREATE POLICY "Delete own maps" ON public.maps
  FOR DELETE USING (auth.uid() = creator_id);

-- 플레이 카운트 증가 함수
CREATE OR REPLACE FUNCTION increment_play_count(map_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.maps
  SET play_count = play_count + 1
  WHERE id = map_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- updated_at 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_maps_updated_at
  BEFORE UPDATE ON public.maps
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
