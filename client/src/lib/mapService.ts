import { supabase } from './supabase'
import type { MapData } from '../stores/editorStore'

export interface MapRecord {
  id: string
  name: string
  creator_id: string
  creator_username: string
  mode: 'race' | 'shooter'
  data: MapData
  thumbnail_url: string | null
  play_count: number
  is_public: boolean
  created_at: string
  updated_at: string
}

export interface UploadMapParams {
  name: string
  data: MapData
  thumbnailBlob?: Blob
  isPublic?: boolean
}

export interface GetMapsOptions {
  limit?: number
  offset?: number
  sortBy?: 'created_at' | 'play_count'
  sortOrder?: 'asc' | 'desc'
  mode?: 'race' | 'shooter'
  shooterSubMode?: 'ffa' | 'team' | 'domination'
}

class MapService {
  // 맵 업로드
  async uploadMap(params: UploadMapParams): Promise<MapRecord> {
    const { name, data, thumbnailBlob, isPublic = true } = params

    // 현재 유저 정보 가져오기
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      throw new Error('로그인이 필요합니다')
    }

    const username = user.user_metadata?.username || user.email?.split('@')[0] || 'Unknown'

    let thumbnailUrl: string | null = null

    // 썸네일 업로드 (있는 경우)
    if (thumbnailBlob) {
      const fileName = `${user.id}/${Date.now()}.png`
      const { error: uploadError } = await supabase.storage
        .from('map-thumbnails')
        .upload(fileName, thumbnailBlob, {
          contentType: 'image/png',
          upsert: true,
        })

      if (uploadError) {
        console.error('썸네일 업로드 실패:', uploadError)
      } else {
        const { data: urlData } = supabase.storage
          .from('map-thumbnails')
          .getPublicUrl(fileName)
        thumbnailUrl = urlData.publicUrl
      }
    }

    // 맵 데이터 저장
    const { data: mapRecord, error: insertError } = await supabase
      .from('maps')
      .insert({
        name,
        creator_id: user.id,
        creator_username: username,
        mode: data.mode,
        data: data,
        thumbnail_url: thumbnailUrl,
        is_public: isPublic,
      })
      .select()
      .single()

    if (insertError) {
      throw new Error(`맵 저장 실패: ${insertError.message}`)
    }

    return mapRecord as MapRecord
  }

  // 공개 맵 목록 조회
  async getPublicMaps(options: GetMapsOptions = {}): Promise<MapRecord[]> {
    const {
      limit = 20,
      offset = 0,
      sortBy = 'created_at',
      sortOrder = 'desc',
      mode,
      shooterSubMode,
    } = options

    let query = supabase
      .from('maps')
      .select('*')
      .eq('is_public', true)

    if (mode) {
      query = query.eq('mode', mode)
    }

    if (shooterSubMode) {
      query = query.eq('data->>shooterSubMode', shooterSubMode)
    }

    const { data, error } = await query
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + limit - 1)

    if (error) {
      throw new Error(`맵 목록 조회 실패: ${error.message}`)
    }

    return data as MapRecord[]
  }

  // 내 맵 목록 조회
  async getMyMaps(mode?: 'race' | 'shooter', shooterSubMode?: 'ffa' | 'team' | 'domination'): Promise<MapRecord[]> {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      throw new Error('로그인이 필요합니다')
    }

    let query = supabase
      .from('maps')
      .select('*')
      .eq('creator_id', user.id)

    if (mode) {
      query = query.eq('mode', mode)
    }

    if (shooterSubMode) {
      query = query.eq('data->>shooterSubMode', shooterSubMode)
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`내 맵 조회 실패: ${error.message}`)
    }

    return data as MapRecord[]
  }

  // 특정 맵 조회
  async getMap(id: string): Promise<MapRecord> {
    const { data, error } = await supabase
      .from('maps')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      throw new Error(`맵 조회 실패: ${error.message}`)
    }

    return data as MapRecord
  }

  // 맵 삭제
  async deleteMap(id: string): Promise<boolean> {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      throw new Error('로그인이 필요합니다')
    }

    // 맵 삭제 (RLS로 자기 맵만 삭제 가능)
    const { error } = await supabase
      .from('maps')
      .delete()
      .eq('id', id)
      .eq('creator_id', user.id)

    if (error) {
      throw new Error(`맵 삭제 실패: ${error.message}`)
    }

    return true
  }

  // 플레이 카운트 증가
  async incrementPlayCount(id: string): Promise<void> {
    const { error } = await supabase.rpc('increment_play_count', { map_id: id })
    if (error) {
      console.error('플레이 카운트 증가 실패:', error)
    }
  }

  // 3D 캔버스에서 썸네일 캡처
  captureThumbnail(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('썸네일 캡처 실패'))
        }
      }, 'image/png', 0.9)
    })
  }
}

export const mapService = new MapService()
