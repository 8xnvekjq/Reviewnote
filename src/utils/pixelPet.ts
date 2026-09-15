import { supabase } from '../services/supabase';
import { DOG_ITEM_ID } from '../features/pixel-room/pet/dogModel';
export async function fetchActivePet(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('pixel_pet_equipment').select('active_pet').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data?.active_pet === DOG_ITEM_ID ? DOG_ITEM_ID : null;
}
export async function saveActivePet(userId: string, active: boolean): Promise<string | null> {
  const { error } = await supabase.from('pixel_pet_equipment').upsert({ user_id: userId, active_pet: active ? DOG_ITEM_ID : null }, { onConflict: 'user_id' });
  if (error) throw error;
  return fetchActivePet(userId);
}
