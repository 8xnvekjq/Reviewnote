import { supabase } from '../services/supabase';
import { isPetId } from '../features/pixel-room/pet/petKinds';
import type { PetId } from '../features/pixel-room/pet/petKinds';
export async function fetchActivePet(userId: string): Promise<PetId | null> {
  const { data, error } = await supabase.from('pixel_pet_equipment').select('active_pet').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return isPetId(data?.active_pet) ? data.active_pet : null;
}
export async function saveActivePet(userId: string, active: PetId | null): Promise<PetId | null> {
  if (active !== null && !isPetId(active)) throw new Error('Unknown pet');
  const { error } = await supabase.from('pixel_pet_equipment').upsert({ user_id: userId, active_pet: active }, { onConflict: 'user_id' });
  if (error) throw error;
  return fetchActivePet(userId);
}
