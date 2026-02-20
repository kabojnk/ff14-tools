import { supabase } from '@/lib/supabase'

interface UploadResult {
  url: string
  filename: string
  size: number
  type: string
}

export async function uploadFile(file: File, path: string = 'uploads'): Promise<UploadResult> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('path', path)

  const { data, error } = await supabase.functions.invoke('upload-media', {
    body: formData,
  })

  if (error) throw new Error(error.message || 'Upload failed')
  return data as UploadResult
}

export function getFileType(mimeType: string): 'image' | 'video' | 'gif' | 'file' {
  if (mimeType === 'image/gif') return 'gif'
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  return 'file'
}
