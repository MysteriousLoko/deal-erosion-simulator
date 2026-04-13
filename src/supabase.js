import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://leudrvjflfiovmqkkyji.supabase.co'
const supabaseKey = 'sb_publishable_hhT248CUZVTzhkDCvkWL6A_F76lWdAl'

export const supabase = createClient(supabaseUrl, supabaseKey)
