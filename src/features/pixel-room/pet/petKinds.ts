export type PetId = 'pet_dog' | 'pet_duck' | 'pet_bear';
export const DUCK_ITEM_ID: PetId = 'pet_duck';
export const BEAR_ITEM_ID: PetId = 'pet_bear';
export function isPetId(value: unknown): value is PetId { return value === 'pet_dog' || value === DUCK_ITEM_ID || value === BEAR_ITEM_ID; }
