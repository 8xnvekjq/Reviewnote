import { Bear, BearSprite } from './Bear';
import { Dog, DogSprite } from './Dog';
import { Duck, DuckSprite } from './Duck';
import { Pigeon, PigeonSprite } from './Pigeon';
import type { PetProps } from './petInteraction';
import type { PetId } from './petKinds';
export function Companion({ pet, ...props }: PetProps & { pet: PetId }) {
  return pet === 'pet_bear' ? <Bear {...props} /> : pet === 'pet_pigeon' ? <Pigeon {...props} /> : pet === 'pet_duck' ? <Duck {...props} /> : <Dog {...props} />;
}
export function PetPreview({ pet }: { pet: string }) { return pet === 'pet_bear' ? <BearSprite /> : pet === 'pet_pigeon' ? <PigeonSprite /> : pet === 'pet_duck' ? <DuckSprite /> : pet === 'pet_dog' ? <DogSprite /> : null; }
