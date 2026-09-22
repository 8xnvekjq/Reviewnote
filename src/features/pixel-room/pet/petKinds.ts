export type PetId = 'pet_dog' | 'pet_duck';
export const DUCK_ITEM_ID: PetId = 'pet_duck';
export function isPetId(value: unknown): value is PetId { return value === 'pet_dog' || value === DUCK_ITEM_ID; }
